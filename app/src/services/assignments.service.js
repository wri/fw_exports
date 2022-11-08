import config from "config";
import logger from "../logger";
import axios from "axios";
const loggedInUserService = require("./LoggedInUserService");

export class AssignmentService {
  /**
   * Returns the answer for a given id
   * @param {assignmentId: string} assignmentId The id for the assignment to fetch
   * @returns The assignment object with the id
   */
  static async getAnswer(assignmentId) {
    logger.info(`Getting assignment with id ${assignmentId}`);
    try {
      const baseURL = config.get("coreAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/assignments/${assignmentId}`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const assignment = response.data;
      logger.info("Got assignment", assignment);
      return assignment && assignment.data;
    } catch (e) {
      logger.error("Error while fetching assignment", e);
      return null; // log the error but still return
    }
  }

  static async getAllAssignments() {
    logger.info(`Getting all assignments`);
    try {
      const baseURL = config.get("coreAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/assignments/user`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const assignments = response.data;
      logger.info("Got all assignments", assignments);
      return assignments && assignments.data;
    } catch (e) {
      logger.error("Error while fetching assignments", e);
      return null; // log the error but still return
    }
  }
}
