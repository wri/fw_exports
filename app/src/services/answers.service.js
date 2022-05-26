import config from "config";
import logger from "../logger";
import axios from "axios";
const loggedInUserService = require("./LoggedInUserService");

class AnswerService {
  static async getAnswer(params) {
    const { templateid, answerid } = params;
    logger.info(`Getting answer with id ${answerid} of template id ${templateid}`);
    try {
      const baseURL = config.get("formsAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/reports/${templateid}/answers/${answerid}`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const answer = response.data;
      logger.info("Got answer", answer);
      return answer && answer.data;
    } catch (e) {
      logger.error("Error while fetching answer", e);
      return null; // log the error but still return
    }
  }

  static async getAnswers(params) {
    const { templateid } = params;
    logger.info(`Getting answers of template id ${templateid}`);
    try {
      const baseURL = config.get("formsAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/reports/${templateid}/answers`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const answers = response.data;
      logger.info("Got answers", answers);
      return answers && answers.data;
    } catch (e) {
      logger.error("Error while fetching answers", e);
      return null; // log the error but still return
    }
  }
}
module.exports = AnswerService;
