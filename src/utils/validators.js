/**
 * Validate incoming SOS DTO
 * @param {object} body - Request body
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateSosDto(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object"];
  }
  if (!body.id || typeof body.id !== "string" || body.id.trim() === "") {
    errors.push("Field 'id' is required and must be a non-empty string");
  }
  if (!body.senderDeviceId || typeof body.senderDeviceId !== "string") {
    errors.push("Field 'senderDeviceId' is required and must be a string");
  }
  if (!body.emergencyCategory || typeof body.emergencyCategory !== "string") {
    errors.push("Field 'emergencyCategory' is required and must be a string");
  }
  if (typeof body.createdAt !== "number" || body.createdAt <= 0) {
    errors.push("Field 'createdAt' is required and must be a valid epoch millisecond timestamp");
  }
  return errors;
}

module.exports = {
  validateSosDto,
};
