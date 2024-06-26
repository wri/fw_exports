import config from "config";
import logger from "../logger";
import axios from "axios";
const loggedInUserService = require("./LoggedInUserService");

export class AnswerService {
  /**
   * Fetch the template object by id
   * @param {string} id The id of the template to be fetched
   * @returns The template object
   */
  static async getTemplate(id) {
    //logger.info(`Getting template with id ${id}`);
    try {
      const baseURL = config.get("coreAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/templates/${id}`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const template = response.data;
      //logger.info("Got template", template);
      return template && template.data;
    } catch (e) {
      logger.error("Error while fetching template", e);
      return null; // log the error but still return
    }
  }

  /**
   * Returns the answer for a given id
   * @param {{templateid: string, reportid: string}} params The id for the answer to fetch as well as the parent report of the answer
   * @returns The answer object with the id
   */
  static async getAnswer(params) {
    const { templateid, reportid } = params;
    logger.info(`Getting answer with id ${reportid} of template id ${templateid}`);
    try {
      const baseURL = config.get("coreAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/templates/${templateid}/answers/exports/${reportid}`,
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

  /**
     * Returns the answer for a given id
     * @param {{templateid: string, reportid: string}} params The id for the answer to fetch as well as the parent report of the answer
     * @returns The answer object with the id
     */
  static async getAnswerWithUrl(params) {
    const { templateid, reportid } = params;
    logger.info(`Getting answer with id ${reportid} of template id ${templateid}`);
    try {
      const baseURL = config.get("coreAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/templates/${templateid}/answers/imageExports/${reportid}`,
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
      const baseURL = config.get("coreAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/templates/allAnswers`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const answers = response.data;
      logger.info(`Got ${answers.data.length} answers`);
      return answers && answers.data;
    } catch (e) {
      logger.error("Error while fetching answers", e);
      return null; // log the error but still return
    }
  }
}
