// Import required packages
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Create Express app
const app = express();
app.use(cookieParser());
app.use(session({
  secret: 'mykey123',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    sameSite: 'none',
    maxAge: 3600000
  }
}));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Connect to MongoDB using Mongoose
mongoose.connect('mongodb://127.0.0.1/Blog', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Define Mongoose schema for user data
const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  password: { type: String, required: true },
  age: { type: Number, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
});

// Define the comment schema and model using Mongoose
const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  blogPost: { type: mongoose.Schema.Types.ObjectId, ref: "BlogPost", required: true },
  createdAt: { type: Date, default: Date.now },
});

const Comment = mongoose.model("Comment", commentSchema);

// Define the blog post schema and model using Mongoose
const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  comments: [commentSchema]
});

const BlogPost = mongoose.model("BlogPost", blogPostSchema);


// Create Mongoose model for user data
const User = mongoose.model('User', userSchema);

// Define server endpoint for creating a new user
app.post('/api/signup', async (req, res) => {
  // Extract user data from request body
  const { email, password, age, name } = req.body;
  
  // Check if user with same email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'User already exists' });
  }

  // Create new User instance with extracted data
  const newUser = new User({ email, password, age, name });
  
  // Save new user data to MongoDB
  try {
    const result = await newUser.save();
    // handle result
    res.status(200).send('New user created:');
  } catch (err) {
    // handle errora
    console.error('Error saving user data to MongoDB:', err);
    res.status(500).send('Error saving user data to MongoDB');
  }
});


app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).send({ success: false, message: 'Invalid username or password' });
    }

    if (user.password !== password) {
      return res.status(401).send({ success: false, message: 'Invalid username or password' });
    }

    // Login successful, store the user session
    req.session.user = user;
    const isAdmin = user.role === 'admin'; // assuming you have a 'role' property in your user object that indicates whether the user is an admin
    
    // Set a cookie to store the user's session ID
    res.cookie('sessionID', req.sessionID, {
      httpOnly: true,
      secure: false, // Set to 'true' if using HTTPS
      sameSite: 'none' // Set to 'none' if cross-origin
    });
    
    return res.send({ success: true, isAdmin, user });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/login', (req, res) => {
  const sessionID = req.cookies.sessionID;

  if (req.sessionID === sessionID) {
    const user = req.session.user;
    console.log("session : " + req.session.user);
    if (user) {
      const isAdmin = user.role === 'admin'; // 'role' property in your user object that indicates whether the user is an admin
      return res.send({ success: true, isAdmin, user });
    }
  }

  return res.send({ success: false, message: 'No user session' });
});

app.put('/api/users/:id', isLoggedIn, async (req, res) => {
  const { id } = req.params;

  // Find user in MongoDB by id and update their fields
  try {
    const result = await User.findByIdAndUpdate(id, req.body);

    if (!result) {
      return res.status(404).send('User not found');
    }

    res.status(200).send('User updated');
  } catch (err) {
    console.error('Error updating user data in MongoDB:', err);
    res.status(500).send('Error updating user data in MongoDB');
  }
});

app.post('/api/logout', (req, res) => {
  // Clear the session data and remove the session cookie
  const user = req.session.user;
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying user session:', err);
      return res.status(500).send('Error destroying user session');
    }
    
    res.clearCookie('sessionID');
    return res.status(200).send({ user , message: 'Logged out successfully'});
  });
});


// Define server endpoint for creating a new blog post
app.post('/api/create-blog', isLoggedIn, async (req, res) => {
  // Extract blog post data from request body
  const { title, content } = req.body;

  // Create new BlogPost instance with extracted data and current user as author
  const newBlogPost = new BlogPost({ title, content, author: req.session.user._id });

  // Save new blog post data to MongoDB
  try {
    const result = await newBlogPost.save();
    // handle result
    res.status(200).send('New blog post created');
  } catch (err) {
    // handle error
    console.error('Error saving blog post data to MongoDB:', err);
    res.status(500).send('Error saving blog post data to MongoDB');
  }
});

// Define server endpoint for reading a blog post by id
app.get('/api/blog/:id', async (req, res) => {
  const { id } = req.params;

  // Find blog post in MongoDB by id and populate author and comments fields
  try {
    const blogPost = await BlogPost.findById(id).populate('author', 'name').populate({
      path: 'comments',
      populate: {
        path: 'author',
        select: 'name'
      }
    });

    if (!blogPost) {
      return res.status(404).send('Blog post not found');
    }

    res.status(200).json(blogPost);
  } catch (err) {
    console.error('Error retrieving blog post data from MongoDB:', err);
    res.status(500).send('Error retrieving blog post data from MongoDB');
  }
});

// Define server endpoint for updating a blog post by id
app.put('/api/blog/:id', isLoggedIn, async (req, res) => {
  const { id } = req.params;

  // Find blog post in MongoDB by id and update its fields
  try {
    const result = await BlogPost.findByIdAndUpdate(id, req.body);

    if (!result) {
      return res.status(404).send('Blog post not found');
    }

    res.status(200).send('Blog post updated');
  } catch (err) {
    console.error('Error updating blog post data in MongoDB:', err);
    res.status(500).send('Error updating blog post data in MongoDB');
  }
});

// Define server endpoint for deleting a blog post by id
app.delete('/api/blog/:id', isLoggedIn, async (req, res) => {
  const { id } = req.params;

  // Find blog post in MongoDB by id and delete it
  try {
    const result = await BlogPost.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).send('Blog post not found');
    }

    res.status(200).send('Blog post deleted');
  } catch (err) {
    console.error('Error deleting blog post data from MongoDB:', err);
    res.status(500).send('Error deleting blog post data from MongoDB');
  }
});

// Define server endpoint for creating a new comment on a blog post
app.post('/api/blog/:id/comment', isLoggedIn, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  // Find blog post in MongoDB by id and add new comment to comments array
  try {
    const blogPost = await BlogPost.findById(id);

    if (!blogPost) {
      return res.status(404).send('Blog post not found');
    }

    const newComment = {
      author: req.session.user._id,
      text,
      blogPost: id // Add blogPost field with id value
    };

    blogPost.comments.push(newComment);

    const result = await blogPost.save();

    res.status(200).send('New comment added');
  } catch (err) {
    console.error('Error adding new comment to blog post in MongoDB:', err);
    res.status(500).send('Error adding new comment to blog post in MongoDB');
  }
});


// Authentication middleware function
function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    // User is logged in, call next middleware function
    return next();
  } else {
    // User is not logged in, redirect to login page
    return res.redirect('/login'); // but since we are not creating front-end this is not necessary 
  }
}

// Start server listening on port 6000
app.listen(6000, () => console.log('Server started listening on port 6000'));

