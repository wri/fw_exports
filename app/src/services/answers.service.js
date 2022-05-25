import config from "config";
import logger from "../logger";
import axios from "axios";
const loggedInUserService = require("./LoggedInUserService");

class AnswerService {
    static async getAnswer(params) {
    const {templateId, answerId} = params
      logger.info(`Getting answer with id ${reportId} of template id ${templateId}`);
      try {
        const baseURL = config.get("formsAPI.url");
        const response = await axios.default({
          baseURL,
          url: `/reports/${templateId}/answers/${answerId}`,
          method: "GET",
          headers: {
            authorization: loggedInUserService.token
          }
        });
        const answer = response.data;
        logger.info("Got answer", answer);
        return answer && answer.data
      } catch (e) {
        logger.error("Error while fetching answer", e);
        return null; // log the error but still return
      }
    }
  }
  module.exports = AnswerService;