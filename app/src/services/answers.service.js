import config from "config";
import logger from "../logger";
import axios from "axios";
const loggedInUserService = require("./LoggedInUserService");

class AnswerService {
  static async getTemplate(id) {
    logger.info(`Getting template with id ${id}`);
    try {
      const baseURL = config.get("formsAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/v3/reports/${id}`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const template = response.data;
      logger.info("Got template", template);
      return template && template.data;
    } catch (e) {
      logger.error("Error while fetching template", e);
      return null; // log the error but still return
    }
  }

  static async getAnswer(params) {
    const { templateid, reportid } = params;
    logger.info(`Getting answer with id ${reportid} of template id ${templateid}`);
    try {
      const baseURL = config.get("formsAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/v3/reports/${templateid}/answers/${reportid}`,
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

  static async getAllAnswers() {
    logger.info(`Getting all answers`);
    try {
      const baseURL = config.get("formsAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/v3/reports/getAllAnswersForUser`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const answers = response.data;
      logger.info("Got all answers", answers);
      return answers && answers.data;
    } catch (e) {
      logger.error("Error while fetching answers", e);
      return null; // log the error but still return
    }
  }
}
module.exports = AnswerService;
