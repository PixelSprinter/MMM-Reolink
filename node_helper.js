const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-Reolink] gestartet");

    this.config = null;
    this.credentials = {};

    this.ffmpeg = null;
    this.httpServer = null;

    this.currentCamera = "garden";
    this.latestFrame = null;
    this.boundary = "--reolinkframe";

    this.onvifEventUrl = null;
    this.onvifSubscription = null;
    this.onvifUsername = null;
    this.onvifPassword = null;
    this.onvifPullGen = 0;
    this.onvifRenewTimer = null;
    this.onvifBusy = false;
    this.onvifPullLogged = false;
    this.ffmpegStopping = false;
    this.streamWatchdog = null;

    if (this.loadCredentials()) {
      console.log("[MMM-Reolink] credentials.json geladen");
    }
  },

  loadCredentials() {
    try {
      const file = path.join(__dirname, "credentials.json");
      this.credentials = JSON.parse(fs.readFileSync(file, "utf8"));
      return true;
    } catch (err) {
      console.error(
        "[MMM-Reolink] credentials.json Fehler:",
        err.message
      );
      return false;
    }
  },

  // Nur LAN-IPv4 (SSR F-Schutz bei offenem MagicMirror-Whitelist)
  isPrivateLanIp(ip) {
    if (typeof ip !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      return false;
    }

    const parts = ip.split(".").map(Number);

    if (parts.some((n) => n > 255)) {
      return false;
    }

    const [a, b] = parts;

    if (a === 10) {
      return true;
    }

    if (a === 192 && b === 168) {
      return true;
    }

    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }

    if (a === 127) {
      return true;
    }

    return false;
  },

  sanitizeCameraConfig(name, camera) {
    if (!camera || typeof camera !== "object") {
      return null;
    }

    if (!this.isPrivateLanIp(camera.ip)) {
      console.error(
        "[MMM-Reolink] Ungültige Kamera-IP verworfen:",
        name
      );
      return null;
    }

    const rtspPort = Number(camera.rtspPort || 554);
    const onvifPort = Number(camera.onvifPort || 8000);
    const stream = String(camera.stream || "Preview_01_sub");

    if (
      !Number.isInteger(rtspPort) ||
      rtspPort < 1 ||
      rtspPort > 65535
    ) {
      return null;
    }

    if (
      !Number.isInteger(onvifPort) ||
      onvifPort < 1 ||
      onvifPort > 65535
    ) {
      return null;
    }

    // Nur einfache RTSP-Pfadsegmente (kein ../, keine URLs)
    if (!/^[A-Za-z0-9._/-]+$/.test(stream) || stream.includes("..")) {
      console.error(
        "[MMM-Reolink] Ungültiger Stream-Pfad verworfen:",
        name
      );
      return null;
    }

    const credential = String(camera.credential || name);

    if (!/^[A-Za-z0-9_-]+$/.test(credential)) {
      return null;
    }

    const clean = {
      enabled: !!camera.enabled,
      credential: credential,
      ip: camera.ip,
      rtspPort: rtspPort,
      stream: stream
    };

    if (name === "doorbell" || camera.onvifPort) {
      clean.onvifPort = onvifPort;
    }

    return clean;
  },

  sanitizeConfig(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const settingsIn = payload.settings || {};
    const motionIn = settingsIn.motion || {};
    const reserved = new Set(["enabled", "settings", "videoPort"]);

    const config = {
      enabled: payload.enabled !== false,
      settings: {
        mainCamera: "garden",
        doorbellTimeout: Math.min(
          Math.max(Number(settingsIn.doorbellTimeout) || 30000, 1000),
          300000
        ),
        border: String(settingsIn.border || "1px").slice(0, 16),
        infoText: String(settingsIn.infoText || "Kamera deaktiviert").slice(0, 80),
        motion: {
          enabled: !!motionIn.enabled,
          switchCamera: !!motionIn.switchCamera,
          timeout: Math.min(
            Math.max(Number(motionIn.timeout) || 10000, 1000),
            120000
          )
        }
      },
      videoPort: (() => {
        const p = Number(payload.videoPort) || 8090;
        return Number.isInteger(p) && p >= 1024 && p <= 65535 ? p : 8090;
      })()
    };

    const cameraNames = Object.keys(payload).filter((name) => {
      return (
        !reserved.has(name) &&
        payload[name] &&
        typeof payload[name] === "object"
      );
    });

    if (!cameraNames.includes("doorbell")) {
      return null;
    }

    for (const name of cameraNames) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        console.error(
          "[MMM-Reolink] Ungültiger Kameraname:",
          name
        );
        return null;
      }

      const clean = this.sanitizeCameraConfig(name, payload[name]);

      if (!clean) {
        return null;
      }

      config[name] = clean;
    }

    const requested = String(settingsIn.mainCamera || "garden");

    if (requested === "doorbell") {
      config.settings.mainCamera = "doorbell";
    } else if (config[requested]) {
      config.settings.mainCamera = requested;
    } else if (config.garden) {
      config.settings.mainCamera = "garden";
    }

    return config;
  },

  redactSecrets(text) {
    return String(text)
      .replace(
        /(rtsp|http|https):\/\/([^:/@\s]+):([^@/\s]+)@/gi,
        "$1://***:***@"
      )
      .replace(
        /(--user\s+)([^\s:]+):([^\s]+)/gi,
        "$1***:***"
      );
  },

  socketNotificationReceived(notification, payload) {

    if (notification === "REOLINK_INIT") {

      const clean = this.sanitizeConfig(payload);

      if (!clean) {
        console.error(
          "[MMM-Reolink] Config abgelehnt (Sanitizer)"
        );
        return;
      }

      this.config = clean;

      console.log("[MMM-Reolink] Config geladen");

      this.startHttpServer();

      setTimeout(() => {

        const settings = this.config.settings || {};
        const mainCamera = settings.mainCamera || "garden";

        if (
          this.config[mainCamera] &&
          this.config[mainCamera].enabled
        ) {
          console.log(
            "[MMM-Reolink] Startkamera:",
            mainCamera
          );
          this.switchCamera(mainCamera);
        } else {
          console.log(
            "[MMM-Reolink] Main-Kamera deaktiviert:",
            mainCamera
          );
        }

        this.startDoorbellEvents();

      }, 500);
    }

    if (
      notification === "REOLINK_SWITCH" &&
      payload?.camera
    ) {
      if (!this.config?.[payload.camera]?.ip) {
        return;
      }

      this.switchCamera(payload.camera);
    }

    if (notification === "REOLINK_STOP") {
      this.stopCamera();
    }
  },

  startHttpServer() {

    if (this.httpServer) {
      return;
    }

    const port = this.config?.videoPort || 8090;

    this.httpServer = http.createServer((req, res) => {

      const pathOnly = req.url.split("?")[0];

      if (pathOnly === "/reolink.jpg") {
        const frame = this.latestFrame;

        if (!frame) {
          res.writeHead(404, { "Cache-Control": "no-store" });
          res.end();
          return;
        }

        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "Content-Length": frame.length
        });
        res.end(frame);
        return;
      }

      if (pathOnly !== "/reolink.mjpg") {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, {
        "Content-Type":
          "multipart/x-mixed-replace; boundary=" +
          this.boundary,

        "Cache-Control":
          "no-cache, no-store, must-revalidate",

        "Pragma": "no-cache",
        "Connection": "close"
      });

      const sendFrame = () => {

        if (!this.latestFrame) {
          return;
        }

        try {

          res.write(
            this.boundary + "\r\n" +
            "Content-Type: image/jpeg\r\n" +
            "Content-Length: " +
            this.latestFrame.length +
            "\r\n\r\n"
          );

          res.write(this.latestFrame);
          res.write("\r\n");

        } catch (err) {
          clearInterval(timer);
        }
      };

      sendFrame();

      const timer = setInterval(
        sendFrame,
        100
      );

      req.on("close", () => {
        clearInterval(timer);
      });
    });

    this.httpServer.listen(
      port,
      "127.0.0.1",
      () => {

        console.log(
          "[MMM-Reolink] HTTP-Stream aktiv auf Port",
          port
        );

        this.sendSocketNotification(
          "REOLINK_READY",
          {
            url:
              "http://127.0.0.1:" +
              port +
              "/reolink.jpg"
          }
        );
      }
    );
  },

  streamTimeoutMs() {
    const settings = this.config?.settings || {};
    const motion = settings.motion || {};
    const doorbellMs = Number(settings.doorbellTimeout) || 30000;
    const motionMs = Number(motion.timeout) || 10000;
    // Frontend kann per Event verlängern; hartes Limit + Puffer gegen Hänger
    return Math.max(doorbellMs, motionMs) + 5000;
  },

  clearStreamWatchdog() {
    if (this.streamWatchdog) {
      clearTimeout(this.streamWatchdog);
      this.streamWatchdog = null;
    }
  },

  armStreamWatchdog() {
    this.clearStreamWatchdog();
    const ms = this.streamTimeoutMs();
    this.streamWatchdog = setTimeout(() => {
      this.streamWatchdog = null;
      if (!this.ffmpeg) {
        return;
      }
      console.log(
        "[MMM-Reolink] Stream-Watchdog: Stop nach",
        ms,
        "ms"
      );
      this.stopCamera();
    }, ms);
  },

  stopCamera() {

    this.clearStreamWatchdog();
    this.ffmpegStopping = true;

    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGTERM");
      this.ffmpeg = null;
    }

    this.latestFrame = null;
    this.currentCamera = null;
    this.frameAnnounced = false;

    console.log("[MMM-Reolink] Stream gestoppt");
  },

  switchCamera(cameraName) {

    const camera = this.config?.[cameraName];

    if (!camera || !camera.enabled) {

      console.error(
        "[MMM-Reolink] Kamera nicht verfügbar:",
        cameraName
      );

      return;
    }

    // Läuft diese Kamera schon mit lebendigem ffmpeg: nicht killen
    if (
      this.currentCamera === cameraName &&
      this.ffmpeg
    ) {
      // Frontend verlängert Display — Watchdog mitziehen
      this.armStreamWatchdog();
      return;
    }

    const credential =
      this.credentials[camera.credential];

    if (
      !credential?.username ||
      !credential?.password
    ) {

      console.error(
        "[MMM-Reolink] Zugangsdaten fehlen:",
        cameraName
      );

      return;
    }

    this.ffmpegStopping = true;

    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGTERM");
      this.ffmpeg = null;
    }

    this.ffmpegStopping = false;
    this.currentCamera = cameraName;

    const rtspUrl =
      "rtsp://" +
      encodeURIComponent(credential.username) +
      ":" +
      encodeURIComponent(credential.password) +
      "@" +
      camera.ip +
      ":" +
      (camera.rtspPort || 554) +
      "/" +
      camera.stream;

    console.log(
      "[MMM-Reolink] Starte Kamera:",
      cameraName
    );

    this.latestFrame = null;
    this.frameAnnounced = false;
    this.armStreamWatchdog();

    this.ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "warning",

      "-rtsp_transport",
      "tcp",

      "-i",
      rtspUrl,

      "-an",

      "-f",
      "mjpeg",

      "-q:v",
      "5",

      "pipe:1"
    ]);

    let buffer = Buffer.alloc(0);
    const startedFor = cameraName;

    this.ffmpeg.stdout.on(
      "data",
      chunk => {

        buffer = Buffer.concat([
          buffer,
          chunk
        ]);

        while (true) {

          const start =
            buffer.indexOf(
              Buffer.from([
                0xff,
                0xd8
              ])
            );

          if (start === -1) {
            break;
          }

          const end =
            buffer.indexOf(
              Buffer.from([
                0xff,
                0xd9
              ]),
              start + 2
            );

          if (end === -1) {
            break;
          }

          this.latestFrame =
            Buffer.from(
              buffer.slice(
                start,
                end + 2
              )
            );

          if (!this.frameAnnounced) {
            this.frameAnnounced = true;
            console.log(
              "[MMM-Reolink] Frame",
              this.latestFrame.length,
              "bytes"
            );
            this.sendSocketNotification("REOLINK_FRAME", {});
          }

          buffer =
            buffer.slice(end + 2);
        }
      }
    );

    this.ffmpeg.stderr.on(
      "data",
      data => {

        const text =
          this.redactSecrets(data.toString()).trim();

        if (text) {

          console.log(
            "[MMM-Reolink] ffmpeg:",
            text
          );
        }
      }
    );

    this.ffmpeg.on(
      "close",
      code => {

        this.clearStreamWatchdog();

        if (this.ffmpegStopping) {
          this.ffmpeg = null;
          return;
        }

        console.log(
          "[MMM-Reolink] ffmpeg beendet, Kamera:",
          startedFor,
          "Code:",
          code
        );

        // Unerwartet weg: nächster SWITCH muss neu starten können
        if (this.currentCamera === startedFor) {
          this.currentCamera = null;
        }

        this.ffmpeg = null;
        this.latestFrame = null;
      }
    );
  },

  startDoorbellEvents() {

    const camera =
      this.config?.doorbell;

    if (!camera || !camera.enabled) {
      return;
    }

    this.loadCredentials();

    const credential =
      this.credentials[camera.credential];

    if (
      !credential?.username ||
      !credential?.password
    ) {

      console.error(
        "[MMM-Reolink] Doorbell-Zugangsdaten fehlen"
      );

      return;
    }

    this.onvifEventUrl =
      "http://" +
      camera.ip +
      ":" +
      (camera.onvifPort || 8000) +
      "/onvif/event_service";

    this.onvifUsername =
      credential.username;

    this.onvifPassword =
      credential.password;

    console.log(
      "[MMM-Reolink] ONVIF Event-Service:",
      this.onvifEventUrl
    );

    this.createPullPointSubscription();
  },

  createPullPointSubscription() {

    if (!this.onvifEventUrl) {
      return;
    }

    // Exact Reolink format from reolink_aio templates.PULLPOINT_XML
    const action =
      "http://www.onvif.org/ver10/events/wsdl/" +
      "EventPortType/CreatePullPointSubscriptionRequest";

    const innerBody =
      "<wsdl:CreatePullPointSubscription>" +
      "<wsdl:InitialTerminationTime>PT15M</wsdl:InitialTerminationTime>" +
      "</wsdl:CreatePullPointSubscription>";

    const body = this.buildOnvifEnvelope(
      action,
      null,
      innerBody
    );

    this.soapRequest(
      this.onvifEventUrl,
      body,
      action,
      20,
      (err, xml) => {

        if (err) {
          console.error(
            "[MMM-Reolink] PullPoint Subscription:",
            err.message
          );

          setTimeout(
            () => this.createPullPointSubscription(),
            30000
          );

          return;
        }

        const address =
          this.extractXml(xml, "Address");

        if (!address || !/^https?:\/\//i.test(address)) {

          const fault =
            this.extractXml(xml, "Text") ||
            this.extractXml(xml, "Reason");

          console.error(
            "[MMM-Reolink] PullPoint keine Subscription-Adresse" +
            (fault ? ": " + fault : "")
          );

          setTimeout(
            () => this.createPullPointSubscription(),
            30000
          );

          return;
        }

        this.onvifSubscription = address;
        this.onvifPullGen += 1;

        console.log(
          "[MMM-Reolink] PullPoint Subscription OK"
        );

        this.scheduleSubscriptionRenewal();
        this.pullDoorbellMessages(this.onvifPullGen);
      }
    );
  },

  pullDoorbellMessages(gen) {

    if (!this.onvifSubscription) {
      return;
    }

    if (gen !== this.onvifPullGen) {
      return;
    }

    if (this.onvifBusy) {
      return;
    }

    this.onvifBusy = true;

    const action =
      "http://www.onvif.org/ver10/events/wsdl/" +
      "PullPointSubscription/PullMessagesRequest";

    const innerBody =
      "<wsdl:PullMessages>" +
      "<wsdl:Timeout>PT60S</wsdl:Timeout>" +
      "<wsdl:MessageLimit>100</wsdl:MessageLimit>" +
      "</wsdl:PullMessages>";

    const body = this.buildOnvifEnvelope(
      action,
      this.onvifSubscription,
      innerBody
    );

    this.soapRequest(
      this.onvifEventUrl,
      body,
      action,
      90,
      (err, xml) => {

        this.onvifBusy = false;

        if (gen !== this.onvifPullGen) {
          return;
        }

        if (err) {

          console.error(
            "[MMM-Reolink] PullMessages:",
            err.message
          );

          this.onvifSubscription = null;

          setTimeout(
            () => this.createPullPointSubscription(),
            10000
          );

          return;
        }

        this.processDoorbellEvents(xml);

        if (!this.onvifPullLogged) {
          this.onvifPullLogged = true;
          console.log("[MMM-Reolink] ONVIF PullMessages aktiv");
        }

        setImmediate(
          () => this.pullDoorbellMessages(gen)
        );
      }
    );
  },

  processDoorbellEvents(xml) {

    if (!xml) {
      return;
    }

    const chunks = xml.split(/<(?:[\w-]+:)?NotificationMessage\b/i);
    const messages = chunks.length > 1 ? chunks.slice(1) : [xml];

    let visitor = false;
    let motion = false;

    for (const message of messages) {
      const topicMatch =
        message.match(
          /<(?:[\w-]+:)?Topic\b[^>]*>([^<]+)</i
        );

      const topic =
        topicMatch
          ? topicMatch[1].trim()
          : "";

      const rule =
        topic
          ? topic.split("/").pop().replace(/^.*:/, "")
          : "";

      // Reolink: Motion nutzt IsMotion, alles andere State
      // (starkillerOG/reolink_aio ONVIF_event_callback)
      const valueName =
        rule === "Motion"
          ? "IsMotion"
          : "State";

      const valueMatch =
        message.match(
          new RegExp(
            "<(?:[\\w-]+:)?SimpleItem[^>]+Name=[\"']" +
              valueName +
              "[\"'][^>]+Value=[\"']([^\"']+)[\"']",
            "i"
          )
        ) ||
        message.match(
          new RegExp(
            "<(?:[\\w-]+:)?SimpleItem[^>]+Value=[\"']([^\"']+)[\"'][^>]+Name=[\"']" +
              valueName +
              "[\"']",
            "i"
          )
        );

      // Fallback: Topic ohne Value-Feld trotzdem erkennen
      const active =
        valueMatch
          ? valueMatch[1].toLowerCase() === "true"
          : false;

      if (!active) {
        continue;
      }

      if (rule === "Visitor") {
        visitor = true;
        continue;
      }

      if (
        rule === "Motion" ||
        rule === "MotionAlarm" ||
        rule === "PeopleDetect"
      ) {
        motion = true;
      }
    }

    if (visitor) {
      console.log("[MMM-Reolink] Doorbell geklingelt");

      this.sendSocketNotification("REOLINK_DOORBELL", {
        camera: "doorbell"
      });
    }

    if (motion) {
      const motionCfg =
        (this.config &&
          this.config.settings &&
          this.config.settings.motion) || {};

      if (!motionCfg.enabled) {
        return;
      }

      const now = Date.now();

      if (
        !this._lastMotionLog ||
        now - this._lastMotionLog > 5000
      ) {
        this._lastMotionLog = now;
        console.log("[MMM-Reolink] Motion erkannt (doorbell)");
      }

      this.sendSocketNotification("REOLINK_MOTION", {
        camera: "doorbell"
      });
    }
  },

  scheduleSubscriptionRenewal() {

    if (this.onvifRenewTimer) {
      clearTimeout(this.onvifRenewTimer);
    }

    this.onvifRenewTimer = setTimeout(
      () => this.renewPullPointSubscription(),
      8 * 60 * 1000
    );
  },

  renewPullPointSubscription() {

    if (!this.onvifSubscription) {
      this.createPullPointSubscription();
      return;
    }

    const action =
      "http://docs.oasis-open.org/wsn/bw-2/SubscriptionManager/RenewRequest";

    const innerBody =
      "<b:Renew xmlns:b=\"http://docs.oasis-open.org/wsn/b-2\">" +
      "<b:TerminationTime>PT15M</b:TerminationTime>" +
      "</b:Renew>";

    const body = this.buildOnvifEnvelope(
      action,
      this.onvifSubscription,
      innerBody
    );

    this.soapRequest(
      this.onvifEventUrl,
      body,
      action,
      20,
      (err, xml) => {

        if (err || (xml && /Fault/i.test(xml) && !/RenewResponse/i.test(xml))) {

          console.error(
            "[MMM-Reolink] PullPoint Renew fehlgeschlagen, neue Subscription"
          );

          this.onvifSubscription = null;
          this.createPullPointSubscription();
          return;
        }

        console.log("[MMM-Reolink] PullPoint Renew OK");
        this.scheduleSubscriptionRenewal();
      }
    );
  },

  // Matches reolink_aio templates.py PULLPOINT/PULLMESSAGE/RENEW
  buildOnvifEnvelope(action, to, innerBody) {

    const tokenId = crypto.randomUUID();
    const nonce = crypto.randomBytes(16);
    const created =
      new Date()
        .toISOString()
        .replace(/\.\d{3}Z$/, ".000Z");

    const digest =
      crypto
        .createHash("sha1")
        .update(
          Buffer.concat([
            nonce,
            Buffer.from(created, "utf8"),
            Buffer.from(this.onvifPassword || "", "utf8")
          ])
        )
        .digest("base64");

    const toHeader = to
      ? "<add:To>" + this.xmlEscape(to) + "</add:To>"
      : "";

    return (
      '<soap:Envelope ' +
      'xmlns:add="http://www.w3.org/2005/08/addressing" ' +
      'xmlns:soap="http://www.w3.org/2003/05/soap-envelope" ' +
      'xmlns:wsdl="http://www.onvif.org/ver10/events/wsdl">' +
      "<soap:Header>" +
      "<add:Action>" + action + "</add:Action>" +
      toHeader +
      '<wsse:Security soap:mustUnderstand="true" ' +
      'xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" ' +
      'xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">' +
      '<wsse:UsernameToken wsu:Id="UsernameToken-' + tokenId + '">' +
      "<wsse:Username>" +
      this.xmlEscape(this.onvifUsername || "") +
      "</wsse:Username>" +
      '<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">' +
      digest +
      "</wsse:Password>" +
      '<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' +
      nonce.toString("base64") +
      "</wsse:Nonce>" +
      "<wsu:Created>" + created + "</wsu:Created>" +
      "</wsse:UsernameToken>" +
      "</wsse:Security>" +
      "</soap:Header>" +
      "<soap:Body>" +
      innerBody +
      "</soap:Body>" +
      "</soap:Envelope>"
    );
  },

  parseDigestChallenge(header) {
    const values = {};
    const parts = String(header).replace(/^Digest\s+/i, "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx === -1) {
        continue;
      }
      const key = part.slice(0, idx).trim();
      let val = part.slice(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      if (!values[key]) {
        values[key] = val;
      }
    }

    return values;
  },

  buildDigestAuth(challenge, method, digestUri) {
    const realm = challenge.realm || "";
    const nonce = challenge.nonce || "";
    const qop = (challenge.qop || "auth").split(",")[0].trim();
    const opaque = challenge.opaque;
    const algorithm = challenge.algorithm || "MD5";
    const cnonce = crypto.randomBytes(8).toString("hex");
    const nc = "00000001";
    const username = this.onvifUsername || "";
    const password = this.onvifPassword || "";

    const ha1 = crypto
      .createHash("md5")
      .update(username + ":" + realm + ":" + password)
      .digest("hex");

    const ha2 = crypto
      .createHash("md5")
      .update(method + ":" + digestUri)
      .digest("hex");

    const response = crypto
      .createHash("md5")
      .update(
        qop
          ? ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":" + qop + ":" + ha2
          : ha1 + ":" + nonce + ":" + ha2
      )
      .digest("hex");

    let header =
      'Digest username="' + username + '", ' +
      'realm="' + realm + '", ' +
      'nonce="' + nonce + '", ' +
      'uri="' + digestUri + '", ' +
      "algorithm=" + algorithm + ", " +
      'response="' + response + '"';

    if (qop) {
      header +=
        ", qop=" + qop +
        ", nc=" + nc +
        ', cnonce="' + cnonce + '"';
    }

    if (opaque) {
      header += ', opaque="' + opaque + '"';
    }

    return header;
  },

  // reolink_aio: Content-Type without action=; separate action header; body resent on auth
  soapRequest(url, body, action, timeoutSec, callback) {
    const parsed = new URL(url);
    const digestUri = parsed.pathname + (parsed.search || "");
    const payload = Buffer.from(body, "utf8");

    const send = (authorization) => {
      const headers = {
        "Content-Type": "application/soap+xml;charset=UTF-8",
        "action": action,
        "Content-Length": payload.length,
        "Connection": "close"
      };

      if (authorization) {
        headers.Authorization = authorization;
      }

      const req = http.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: digestUri,
          method: "POST",
          headers,
          timeout: (timeoutSec || 20) * 1000
        },
        (res) => {
          const chunks = [];

          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const xml = Buffer.concat(chunks).toString("utf8");
            const www = res.headers["www-authenticate"];

            if (res.statusCode === 401 && www && !authorization) {
              const challenge = this.parseDigestChallenge(www);
              const auth = this.buildDigestAuth(
                challenge,
                "POST",
                digestUri
              );
              send(auth);
              return;
            }

            if (res.statusCode === 401) {
              callback(new Error("HTTP 401 Unauthorized (Zugangsdaten prüfen)"));
              return;
            }

            if (res.statusCode >= 400 && !/Fault|Envelope/i.test(xml)) {
              callback(new Error("HTTP " + res.statusCode));
              return;
            }

            callback(null, xml);
          });
        }
      );

      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });

      req.on("error", (err) => {
        callback(err);
      });

      req.write(payload);
      req.end();
    };

    send(null);
  },

  extractXml(xml, tag) {

    if (!xml) {
      return null;
    }

    const regex =
      new RegExp(
        "<(?:[A-Za-z0-9_-]+:)?" +
        tag +
        "\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?" +
        tag +
        ">",
        "i"
      );

    const match = xml.match(regex);

    if (!match) {
      return null;
    }

    return match[1]
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/g,
        "$1"
      )
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  },

  xmlEscape(value) {

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

});
