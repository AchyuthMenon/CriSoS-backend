const assert = require("assert");
const http = require("http");
const app = require("../src/app");
const { validateSosDto } = require("../src/utils/validators");

console.log("Running CriSOS Extended MVC Integration Tests...");

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}${path}`;
      const req = http.request(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let body = data;
          try {
            body = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      });
      req.on("error", reject);
      if (options.body) {
        req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  try {
    // 1. Test Health endpoint
    const healthRes = await request("/api/health");
    assert.strictEqual(healthRes.status, 200, "Health status should be 200");
    assert.strictEqual(healthRes.body.status, "ok", "Health body status should be ok");
    console.log("✓ Route Test 1 Passed: GET /api/health returned 200 OK");

    // 2. Test Auth validation on signup (missing body)
    const signupInvalid = await request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { username: "a", password: "12" },
    });
    assert.strictEqual(signupInvalid.status, 400, "Short username should return 400");
    console.log("✓ Route Test 2 Passed: POST /api/auth/signup rejects invalid input");

    // 3. Test SOS validation on POST /api/sos
    const sosInvalid = await request("/api/sos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { id: "" },
    });
    assert.strictEqual(sosInvalid.status, 400, "Missing required SOS fields should return 400");
    assert.strictEqual(sosInvalid.body.success, false);
    console.log("✓ Route Test 3 Passed: POST /api/sos rejects incomplete payload");

    // 4. Test Volunteer without auth
    const volunteerUnauth = await request("/api/sos/test-id/volunteer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {},
    });
    assert.strictEqual(volunteerUnauth.status, 401, "Volunteer without auth should return 401");
    console.log("✓ Route Test 4 Passed: POST /api/sos/:id/volunteer rejects unauthenticated user");

    // 5. Test Auth /api/auth/me without token
    const meRes = await request("/api/auth/me");
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user, null);
    console.log("✓ Route Test 5 Passed: GET /api/auth/me returns user: null when not logged in");

    // 6. Test Auth /api/auth/logout
    const logoutRes = await request("/api/auth/logout", { method: "POST" });
    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(logoutRes.body.success, true);
    console.log("✓ Route Test 6 Passed: POST /api/auth/logout returns 200 OK");

    console.log("All Extended MVC Integration Tests Passed Successfully!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});
