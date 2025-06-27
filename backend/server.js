const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');


//mongosse
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/gitmanager', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Error:', err));

// ///////
dotenv.config();
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

// ---- Passport GitHub Strategy ----
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK,
  },
  function(accessToken, refreshToken, profile, done) {
    profile.accessToken = accessToken;
    profile.provider = 'github'; // 👈
    return done(null, profile);
  }
));

// ---- Serialize / Deserialize ----
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// ---- Routes ----
app.get('/auth/github', passport.authenticate('github', { scope: [ 'user:email', 'repo' ] }));

app.get('/auth/github/callback', passport.authenticate('github', {
  failureRedirect: '/',
}),
(req, res) => {
  // On successful login, redirect to frontend
  res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
});

// Protected route
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect(process.env.FRONTEND_URL);
  });
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});


const GitLabStrategy = require('passport-gitlab2').Strategy;

passport.use(new GitLabStrategy({
    clientID: process.env.GITLAB_CLIENT_ID,
    clientSecret: process.env.GITLAB_CLIENT_SECRET,
    callbackURL: process.env.GITLAB_CALLBACK,
  },
  function(accessToken, refreshToken, profile, done) {
    profile.accessToken = accessToken;
     profile.provider = 'gitlab'; // 👈 Add this line
    return done(null, profile);
  }
));

// GitLab login routes
// app.get('/auth/gitlab', passport.authenticate('gitlab', { scope: ['read_user', 'read_api'] }));
app.get('/auth/gitlab', passport.authenticate('gitlab', { scope: ['read_user'] }));


app.get('/auth/gitlab/callback', passport.authenticate('gitlab', {
  failureRedirect: '/',
}),
(req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
});



//GITHUB
const axios = require('axios');

app.get('/api/github/repos', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });

  const token = req.user.accessToken;

  try {
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `token ${token}`
      }
    });

    // Extract only the fields we need
    const repos = response.data.map(repo => ({
      name: repo.name,
      full_name: repo.full_name,
      stars: repo.stargazers_count,
      default_branch: repo.default_branch,
    }));

    res.json(repos);
  } catch (err) {
    console.error("GitHub repo fetch error:", err);
    res.status(500).json({ error: "Failed to fetch GitHub repos" });
  }
});


//gitlab

app.get('/api/gitlab/repos', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const token = req.user.accessToken;

  try {
    const response = await axios.get('https://gitlab.com/api/v4/projects?membership=true', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const repos = response.data.map(repo => ({
      name: repo.name,
      visibility: repo.visibility,
      default_branch: repo.default_branch,
      star_count: repo.star_count
    }));

    res.json(repos);
  } catch (err) {
    console.error("GitLab repo fetch error:", err.response?.data || err);
    res.status(500).json({ error: "Failed to fetch GitLab repos" });
  }
});



//reposetting
const RepoSetting = require('./models/RepoSetting');

app.post('/api/repo/auto-review', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });

  const { repoName, provider, autoReview } = req.body;

  try {
    const updated = await RepoSetting.findOneAndUpdate(
      { userId: req.user.id, provider, repoName },
      { autoReview },
      { new: true, upsert: true }
    );

    res.json({ success: true, setting: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});


//auto-reiew
app.get('/api/repo/auto-review', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });

  try {
    const settings = await RepoSetting.find({ userId: req.user.id });

    const result = {};
    settings.forEach(setting => {
      result[setting.repoName] = setting.autoReview;
    });

    res.json(result); // send: { "repo1": true, "repo2": false, ... }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// //repodetaiks
// app.get('/api/repo/lines', async (req, res) => {
//   if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });

//   const { repo, provider } = req.query;
//   if (!repo || !provider) return res.status(400).json({ error: 'Missing repo or provider' });

//   try {
//     const tempDir = path.join(__dirname, 'temp', `${provider}_${repo}_${Date.now()}`);

//     // Clone the repo (only shallow for default branch)
//     const token = req.user.accessToken;
//     const cloneUrl = provider === 'github'
//       ? `https://${token}@github.com/${req.user.username}/${repo}.git`
//       : `https://oauth2:${token}@gitlab.com/${req.user.username}/${repo}.git`;

//     exec(`git clone --depth=1 ${cloneUrl} ${tempDir}`, (err) => {
//       if (err) {
//         console.error('Git clone error:', err);
//         return res.status(500).json({ error: 'Failed to clone repo' });
//       }

//       exec(`find ${tempDir} -name '*.js' -exec cat {} + | wc -l`, (err, stdout) => {
//         if (err) {
//           console.error('Line count error:', err);
//           return res.status(500).json({ error: 'Failed to count lines' });
//         }

//         res.json({ lines: parseInt(stdout.trim()) });
//       });
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Internal error' });
//   }
// });



// ... (everything else you already have remains unchanged)

// Replace the /api/repo/lines route with this:
app.get('/api/repo/lines', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });

  const { repo, provider } = req.query;
  if (!repo || !provider) return res.status(400).json({ error: 'Missing repo or provider' });

  try {
    const tempDir = path.join(__dirname, 'temp', `${provider}_${repo}_${Date.now()}`);
    const token = req.user.accessToken;

    const cloneUrl = provider === 'github'
      ? `https://${token}@github.com/${req.user.username}/${repo}.git`
      : `https://oauth2:${token}@gitlab.com/${req.user.username}/${repo}.git`;

    // Step 1: Clone the repo
    exec(`git clone --depth=1 ${cloneUrl} "${tempDir}"`, (err) => {
      if (err) {
        console.error('Git clone error:', err);
        return res.status(500).json({ error: 'Failed to clone repo' });
      }

      // Step 2: Count .js lines using Node.js
      let totalLines = 0;

      function countLines(dirPath) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const fullPath = path.join(dirPath, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            countLines(fullPath);
          } else if (file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            totalLines += content.split('\n').length;
          }
        }
      }

      try {
        countLines(tempDir);
        res.json({ lines: totalLines });
      } catch (err) {
        console.error("Line count error:", err);
        res.status(500).json({ error: 'Failed to count lines' });
      }
    });
  } catch (err) {
    console.error('Internal error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


