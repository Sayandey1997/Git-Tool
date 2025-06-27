const mongoose = require('mongoose');

const repoSettingSchema = new mongoose.Schema({
  userId: String,           // from GitHub or GitLab ID
  provider: String,         // 'github' or 'gitlab'
  repoName: String,
  autoReview: { type: Boolean, default: false }
});

module.exports = mongoose.model('RepoSetting', repoSettingSchema);
