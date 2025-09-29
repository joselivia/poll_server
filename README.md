# Poll Server

A Node.js/TypeScript backend service for a polling web application with user authentication, poll management, and voting functionality.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Project](#running-the-project)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Database Setup](#database-setup)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)

## Prerequisites

Before running this project, make sure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **PostgreSQL** (v12 or higher)
- **Git** (for cloning the repository)

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/joselivia/poll_server.git
   cd poll_server
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Then edit the `.env` file with your configuration (see [Configuration](#configuration) section).

## Configuration

Create a `.env` file in the root directory with the following variables:

```properties
# Server Configuration
PORT=8802

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

### Environment Variables Explained:

- `PORT`: The port on which the server will run (default: 8802)
- `DATABASE_URL`: PostgreSQL connection string
  - Format: `postgresql://username:password@host:port/database_name`
  - Example: `postgresql://postgres:mypassword@localhost:5432/politrack`

## Running the Project

### Development Mode (Recommended)

For development with hot reload:

```bash
npm run dev
```

This will:

- Start the server on the specified port (default: 8802)
- Connect to the PostgreSQL database
- Automatically create required tables
- Set up the admin user

### Production Mode

1. **Build the project**

   ```bash
   npm run build
   ```

2. **Start the server**
   ```bash
   npm start
   ```

## Project Structure

```
poll_server/
├── src/
│   ├── config-db.ts          # Database configuration and connection
│   ├── server.ts             # Main server file
│   └── routes/               # API route handlers
│       ├── admin.ts          # Admin management routes
│       ├── aspirants.ts      # Aspirant/candidate routes
│       ├── login.ts          # Authentication routes
│       ├── opinion_poll.ts   # Opinion poll routes
│       ├── polls.ts          # Poll management routes
│       ├── posts.ts          # Blog/post routes
│       ├── update-admin.ts   # Admin update routes
│       └── votes.ts          # Voting routes
├── dist/                     # Compiled JavaScript (after build)
├── package.json              # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── .env                     # Environment variables
└── README.md               # This file
```

## Available Scripts

| Script          | Description                                    |
| --------------- | ---------------------------------------------- |
| `npm run dev`   | Start development server with hot reload       |
| `npm run build` | Compile TypeScript to JavaScript               |
| `npm start`     | Start production server (requires build first) |

## Database Setup

### PostgreSQL Installation

1. **Windows**: Download from [PostgreSQL official website](https://www.postgresql.org/download/windows/)
2. **macOS**: Use Homebrew: `brew install postgresql`
3. **Linux**: Use package manager: `sudo apt-get install postgresql`

### Database Creation

1. **Start PostgreSQL service**

   ```bash
   # Windows (if installed as service)
   net start postgresql

   # macOS
   brew services start postgresql

   # Linux
   sudo systemctl start postgresql
   ```

2. **Create database**

   ```bash
   psql -U postgres
   CREATE DATABASE politrack;
   \q
   ```

3. **Update .env file** with your database credentials

### Automatic Table Creation

The application automatically creates all required tables when it starts:

- `polls` - Poll information
- `aspirants` - Candidate information
- `votes` - Voting records
- `posts` - Blog posts
- `admin` - Admin users

## API Documentation

The server provides RESTful API endpoints for:

- **Authentication** (`/api/login`)
- **Poll Management** (`/api/polls`)
- **Voting** (`/api/votes`)
- **Aspirant/Candidate Management** (`/api/aspirant`)
- **Blog Posts** (`/api/blogs`)
- **Admin Operations** (`/api/update-admin`)

For detailed API documentation, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

## Server Status

When the server starts successfully, you should see:

```
🚀 Server running on port 8802
✅ Database connected successfully: [timestamp]
✅ All tables are created successfully!
✅ Admin inserted successfully
```

## Troubleshooting

### Common Issues

1. **Database Connection Error**

   ```
   ❌ Database connection failed: ECONNREFUSED
   ```

   **Solution**: Ensure PostgreSQL is running and credentials in `.env` are correct.

2. **Port Already in Use**

   ```
   Error: listen EADDRINUSE :::8802
   ```

   **Solution**: Change the PORT in `.env` or stop the process using that port.

3. **Missing Dependencies**
   ```
   Cannot find module 'express'
   ```
   **Solution**: Run `npm install` to install dependencies.

### Database Connection Test

To test your database connection manually:

```bash
psql -h localhost -p 5432 -U your_username -d your_database
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## License

This project is licensed under the ISC License.

## Support

For support and questions, please open an issue in the GitHub repository.
