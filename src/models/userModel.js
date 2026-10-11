const { ObjectId } = require("mongodb");
const { getUsersCollection } = require("../config/db");

class UserModel {
  /**
   * Find a user by lowercase username
   * @param {string} username
   * @returns {Promise<object|null>}
   */
  static async findByUsername(username) {
    const collection = await getUsersCollection();
    return collection.findOne({ username: username.toLowerCase() });
  }

  /**
   * Find a user by MongoDB ObjectId
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  static async findById(id) {
    const collection = await getUsersCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Create a new user record
   * @param {object} userData
   * @returns {Promise<object>} Insert result
   */
  static async create({ username, passwordHash, createdAt = Date.now() }) {
    const collection = await getUsersCollection();
    return collection.insertOne({
      username: username.toLowerCase(),
      passwordHash,
      createdAt,
    });
  }
}

module.exports = UserModel;
