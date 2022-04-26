import request from "supertest";
import server from "app";

describe("/v1/fw_exports/healthcheck", () => {
  afterAll(() => {
    server.close();
  });

  const exec = () => {
    return request(server).get("/v1/fw_exports/healthcheck");
  };

  it("should return 200 status", async () => {
    const res = await exec();

    expect(res.status).toBe(200);
  });
});
