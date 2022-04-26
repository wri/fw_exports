import config from "config";
import bunyan, { Stream } from "bunyan";

const streams: Stream[] = [
  {
    level: config.get("logger.level") || "debug",
    stream: process.stdout
  }
];

if (config.has("logger.toFile") && config.get("logger.toFile")) {
  streams.push({
    level: config.get("logger.level") || "debug",
    path: config.get("logger.dirLogFile")
  });
}

const logger = bunyan.createLogger({
  name: config.get("logger.name"),
  src: true,
  streams
});

export default logger;
