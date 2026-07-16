const mongoose = require("mongoose");

const AppVersionSchema = new mongoose.Schema({
  latestVersion: {
    type: String,
    required: true,
  },

  apkUrl: {
    type: String,
    required: true,
  },

  forceUpdate: {
    type: Boolean,
    default: false,
  },

  releaseNotes: [
    {
      type: String,
    },
  ],

}, { timestamps: true });

module.exports = mongoose.model("AppVersion", AppVersionSchema);