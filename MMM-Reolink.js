Module.register("MMM-Reolink", {

  defaults: {
    enabled: true,

    settings: {
      mainCamera: "garden",
      doorbellTimeout: 30000,
      border: "1px",
      showPlaceholder: true,
      infoText: "Main camera deactivated",
      motion: {
        enabled: false,
        switchCamera: false,
        timeout: 10000
      }
    },

    garden: {
      enabled: true,
      credential: "garden",
      ip: "192.168.1.10",
      rtspPort: 554,
      stream: "Preview_01_sub"
    },

    doorbell: {
      enabled: true,
      credential: "doorbell",
      ip: "192.168.1.11",
      rtspPort: 554,
      stream: "Preview_01_sub",
      onvifPort: 8000
    },

    videoPort: 8090
  },

  start() {
    const settings = this.config.settings || {};

    this.currentCamera = settings.mainCamera || "garden";
    this.streamUrl = null;
    this.returnTimer = null;
    this.frameTimer = null;
    this.hasFrame = false;
    this.activeReason = null;

    this.sendSocketNotification("REOLINK_INIT", this.config);
  },

  getStyles() {
    return ["MMM-Reolink.css"];
  },

  cameraEnabled(name) {
    return !!(this.config[name] && this.config[name].enabled);
  },

  motionSettings() {
    return (this.config.settings && this.config.settings.motion) || {};
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "reolink-wrapper";

    const settings = this.config.settings || {};
    const showPlaceholder = settings.showPlaceholder !== false;

    const showVideo =
      this.config.enabled &&
      this.streamUrl &&
      this.hasFrame &&
      this.cameraEnabled(this.currentCamera);

    if (!showVideo) {
      if (!showPlaceholder) {
        wrapper.classList.add("reolink-idle-hidden");
        return wrapper;
      }

      wrapper.classList.add("reolink-disabled");
      wrapper.style.borderWidth = settings.border || "1px";

      const status = document.createElement("div");
      status.className = "reolink-disabled-text";
      status.innerText = settings.infoText || "Kamera deaktiviert";

      wrapper.appendChild(status);
      return wrapper;
    }

    wrapper.style.borderWidth = settings.border || "1px";

    const image = document.createElement("img");
    image.className = "reolink-video";
    image.src = this.streamUrl + "?t=" + Date.now();
    image.alt = this.currentCamera;
    wrapper.appendChild(image);

    this.armFrameRefresh();

    return wrapper;
  },

  socketNotificationReceived(notification, payload) {

    if (notification === "REOLINK_READY") {
      this.streamUrl = payload.url;
      this.updateDom();
    }

    if (notification === "REOLINK_FRAME") {
      const first = !this.hasFrame;
      this.hasFrame = true;
      if (first) {
        this.updateDom();
      }
    }

    if (notification === "REOLINK_DOORBELL") {
      this.showCamera(
        (payload && payload.camera) || "doorbell",
        "visitor"
      );
    }

    if (notification === "REOLINK_MOTION") {
      this.onMotion(payload);
    }
  },

  onMotion(payload) {
    const motion = this.motionSettings();

    if (!motion.enabled || !motion.switchCamera) {
      return;
    }

    this.showCamera(
      (payload && payload.camera) || "doorbell",
      "motion"
    );
  },

  showCamera(camera, reason) {

    if (!this.cameraEnabled(camera)) {
      return;
    }

    if (
      this.activeReason === "visitor" &&
      reason === "motion"
    ) {
      return;
    }

    const settings = this.config.settings || {};
    const motion = this.motionSettings();
    const timeout =
      reason === "motion"
        ? (motion.timeout || 10000)
        : (settings.doorbellTimeout || 30000);

    const alreadyShowing =
      this.currentCamera === camera &&
      this.activeReason;

    this.currentCamera = camera;
    this.activeReason = reason;

    this.sendSocketNotification("REOLINK_SWITCH", {
      camera: camera
    });

    if (!alreadyShowing) {
      this.hasFrame = false;
      this.stopFrameRefresh();
      this.updateDom();
    }

    clearTimeout(this.returnTimer);

    this.returnTimer = setTimeout(() => {
      this.returnToMain();
    }, timeout);
  },

  armFrameRefresh() {
    this.stopFrameRefresh();

    this.frameTimer = setInterval(() => {
      const img = document.querySelector(".MMM-Reolink .reolink-video");

      if (!img || !this.streamUrl || !this.hasFrame) {
        return;
      }

      const next = new Image();
      const src = this.streamUrl + "?t=" + Date.now();

      next.onload = () => {
        if (img.isConnected) {
          img.src = src;
        }
      };

      next.src = src;
    }, 300);
  },

  stopFrameRefresh() {
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
  },

  returnToMain() {
    const settings = this.config.settings || {};
    const mainCamera = settings.mainCamera || "garden";

    this.activeReason = null;
    this.hasFrame = false;
    this.stopFrameRefresh();
    this.currentCamera = mainCamera;

    if (this.cameraEnabled(mainCamera)) {
      this.sendSocketNotification("REOLINK_SWITCH", {
        camera: mainCamera
      });
    } else {
      this.sendSocketNotification("REOLINK_STOP", {});
    }

    this.updateDom();
  }

});
