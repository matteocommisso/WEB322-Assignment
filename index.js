const HTTP_PORT = process.env.PORT || 3000;

const express = require("express");
const exphbs = require("express-handlebars");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { MongoClient, ObjectId } = require("mongodb");
const uri =
  "mongodb+srv://matteocommisso123:mother23@web322assignment.tmtsgmy.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri);
const middleware = require("./middleware");

async function connectMongoDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");
  } catch (err) {
    console.error("Error connecting to MongoDB Atlas:", err);
  }
}

connectMongoDB();

const app = express();

app.use(express.json());
app.use(express.static("public"));
app.use(cookieParser());
app.use(
  session({
    secret: "your-secret-key",
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 180000, // 3 minutes
    },
  })
);

const sessionTimeout = (req, res, next) => {
  if (req.session.lastAccess && Date.now() - req.session.lastAccess > 180000) {
    req.session.destroy();
    res.clearCookie("loggedIn");
    res.clearCookie("username");
    return res.redirect("/signin");
  }
  req.session.lastAccess = Date.now();
  next();
};

app.use(sessionTimeout);

app.engine(
  ".hbs",
  exphbs.engine({
    extname: ".hbs",
    defaultLayout: false,
    layoutsDir: path.join(__dirname, "/views"),
    partialsDir: path.join(__dirname, "/views/partials"),
  })
);

app.set("view engine", ".hbs");
app.use(express.urlencoded({ extended: false }));

const userData = require("./users.json");

app.get("/", async (req, res) => {
  try {
    const availableBooks = await client
      .db("library")
      .collection("books")
      .find({ available: true })
      .toArray();

    res.render("landing", {
      data: {
        courseCode: "Web Development",
      },
    });
  } catch (err) {
    console.error("Error fetching data:", err);
    res.status(500).send("Error fetching data from the database");
  }
});

app.get("/signin", (req, res) => {
  res.render("signin");
});

app.post("/signin", middleware.isAuthenticated, (req, res) => {
  console.log("sign-in handler called");
  const username = req.body.username;
  const password = req.body.password;

  if (userData[username]) {
    if (userData[username] === password) {
      req.session.loggedIn = true;
      req.session.username = username;

      res.cookie("loggedIn", true);
      res.cookie("username", username);

      res.redirect(`/home?username=${username}`);
    } else {
      res.render("signin", {
        data: {
          error: "Invalid password",
        },
      });
    }
  } else {
    res.render("signin", {
      data: {
        error: "Not a registered username",
      },
    });
  }
});

const checkLoggedIn = (req, res, next) => {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect("/");
  }
};

app.get("/home", checkLoggedIn, async (req, res) => {
  const username = req.session.username;

  try {
    const availableBooks = await client
      .db("library")
      .collection("books")
      .find({ available: true })
      .toArray();

    const user = await client
      .db("library")
      .collection("clients")
      .findOne({ username });

    const borrowedBookIds = user ? user.IDBooksBorrowed : [];

    const borrowedBooks = await client
      .db("library")
      .collection("books")
      .find({ _id: { $in: borrowedBookIds } })
      .toArray();

    res.render("home", {
      data: {
        username,
        books: {
          available: availableBooks,
          borrowed: borrowedBooks,
        },
      },
    });
  } catch (err) {
    console.error("Error fetching data:", err);
    res.status(500).send("Error fetching data from the database");
  }
});

app.post("/submit", async (req, res) => {
  const selectedBooks = req.body.items;
  const username = req.session.username;

  if (!selectedBooks || selectedBooks.length === 0) {
    // If no books are selected, redirect back to the home page
    return res.redirect(`/home?username=${username}`);
  }

  try {
    const booksCollection = client.db("library").collection("books");
    const clientsCollection = client.db("library").collection("clients");

    // Fetch the books to be borrowed
    const borrowedBooks = await booksCollection
      .find({ _id: { $in: selectedBooks }, available: true })
      .toArray();

    if (borrowedBooks.length > 0) {
      const bookIdsToBorrow = borrowedBooks.map((book) => book._id);

      // Update the "available" property to false for the borrowed books
      await booksCollection.updateMany(
        { _id: { $in: bookIdsToBorrow }, available: true },
        { $set: { available: false } }
      );

      // Add the borrowed book IDs to the user's "IDBooksBorrowed" array
      await clientsCollection.updateOne(
        { username },
        { $addToSet: { IDBooksBorrowed: { $each: bookIdsToBorrow } } }
      );
    }

    res.redirect(`/home?username=${username}`);
  } catch (err) {
    console.error("Error updating data:", err);
    res.status(500).send("Error updating data in the database");
  }
});

app.post("/signout", (req, res) => {
  req.session.destroy();
  res.clearCookie("loggedIn");
  res.clearCookie("username");

  res.redirect("/");
});

const server = app.listen(HTTP_PORT, () => {
  console.log(`Listening on port ${HTTP_PORT}`);
});
