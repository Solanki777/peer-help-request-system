# 📚 Peer Help Request System

A full-stack peer-to-peer academic help platform where students can post questions, share answers, vote on responses, and mark the best solution.

---

## 🚀 Features

* 🔐 User Authentication (JWT-based login/register)
* 📝 Post academic help requests
* 💬 Answer questions
* 👍 Upvote / 👎 Downvote answers
* ⭐ Mark best answer
* 🎯 Filter by subject and branch
* 🏆 Leaderboard (reputation system)

---

## 🛠️ Tech Stack

**Frontend:**

* AngularJS
* HTML, CSS, Bootstrap

**Backend:**

* Node.js
* Express.js

**Database:**

* MongoDB

---

## 🏗️ Project Structure

```
Peer-help-request-system/
│
├── backend/        # Node.js server & APIs
├── frontend/       # AngularJS client
├── db/             # MongoDB data (ignored in Git)
├── .gitignore
├── README.md
```

---

## ⚙️ How to Run Locally

### 1️⃣ Clone the repository

```
git clone https://github.com/Solanki777/peer-help-request-system.git
```

### 2️⃣ Install dependencies

```
cd backend
npm install
```

### 3️⃣ Start MongoDB

```
mongod --dbpath "your_db_path"
```

### 4️⃣ Run backend server

```
node server.js
```

### 5️⃣ Open in browser

```
http://localhost:3000
```

---

## 🔐 Environment Variables

Create a `.env` file in backend folder:

```
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

---

## 📸 Screenshots

*Add your project screenshots here*

---

## 📌 Future Improvements

* 🔔 Real-time notifications (Socket.IO)
* 🔍 Advanced search & filters
* 📱 Responsive UI improvements
* 🌙 Dark mode
* ⚡ React upgrade

---

## 👨‍💻 Author

* Mahesh Solanki

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!
