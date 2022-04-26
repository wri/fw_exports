import request from "supertest";
import server from "app";

describe("/v1/exports/ping", () => {
  afterAll(() => {
    server.close();
  });

  const exec = () => {
    return request(server).get("/v1/exports/ping");
  };

  it("should return 200 status", async () => {
    const res = await exec();

    expect(res.status).toBe(200);
  });

  it("should return pong", async () => {
    const res = await exec();

    expect(res.text).toBe("pong");
  });
});
