const mongoose = require("mongoose");

const { Schema } = mongoose;

const BucketURLSchema = new Schema({
  id: { type: String, required: true },
  URL: { type: String, required: true }
});

BucketURLSchema.index({ id: 1 });

const BucketURLModel = mongoose.model("BucketURL", BucketURLSchema);

module.exports = BucketURLModel;
