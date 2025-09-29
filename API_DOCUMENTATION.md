# API Documentation

This document provides detailed information about all available API endpoints for the Poll Server.

## Base URL

```
http://localhost:8802/api
```

## Table of Contents

- [Authentication](#authentication)
- [Polls Management](#polls-management)
- [Voting System](#voting-system)
- [Aspirants/Candidates](#aspirantscandidates)
- [Blog Posts](#blog-posts)
- [Admin Operations](#admin-operations)
- [Response Formats](#response-formats)
- [Error Handling](#error-handling)

---

## Authentication

### Login

Authenticate admin users to access protected routes.

**POST** `/api/login`

#### Request Body

```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

#### Response

**Success (200)**

```json
{
  "message": "Login successful"
}
```

**Error (401)**

```json
{
  "message": "Invalid credentials"
}
```

---

## Polls Management

### Get All Polls

Retrieve all polls with their details, competitors, and questions.

**GET** `/api/polls`

#### Response

**Success (200)**

```json
[
  {
    "id": 1,
    "title": "Presidential Election Poll",
    "category": "election",
    "presidential": "yes",
    "region": "Nairobi",
    "county": "Nairobi",
    "constituency": "Westlands",
    "ward": "Parklands",
    "createdAt": "2025-09-30T10:00:00Z",
    "voting_expires_at": "2025-10-30T23:59:59Z",
    "competitors": [
      {
        "id": 1,
        "name": "John Doe",
        "party": "Democratic Party",
        "profileImage": "base64_image_data"
      }
    ],
    "questions": [
      {
        "id": 1,
        "type": "single-choice",
        "questionText": "Who would you vote for?",
        "isCompetitorQuestion": true,
        "options": [
          {
            "id": 1,
            "optionText": "John Doe"
          }
        ]
      }
    ]
  }
]
```

### Get Single Poll

Retrieve details of a specific poll.

**GET** `/api/polls/:id`

#### Parameters

- `id` (number): Poll ID

#### Response

Same structure as single poll object above.

### Create Poll

Create a new poll with competitors and questions.

**POST** `/api/polls`

#### Request Body

```json
{
  "title": "New Election Poll",
  "category": "election",
  "presidential": "yes",
  "region": "Nairobi",
  "county": "Nairobi",
  "constituency": "Westlands",
  "ward": "Parklands",
  "voting_expires_at": "2025-10-30T23:59:59Z",
  "competitors": [
    {
      "name": "Candidate Name",
      "party": "Party Name"
    }
  ],
  "questions": [
    {
      "type": "single-choice",
      "questionText": "Sample question?",
      "isCompetitorQuestion": false,
      "options": [{ "optionText": "Option 1" }, { "optionText": "Option 2" }]
    }
  ]
}
```

### Update Poll

Update an existing poll.

**PUT** `/api/polls/:id`

#### Parameters

- `id` (number): Poll ID

#### Request Body

Same structure as create poll.

### Delete Poll

Delete a poll and all associated data.

**DELETE** `/api/polls/:id`

#### Parameters

- `id` (number): Poll ID

### Publish/Unpublish Poll

Toggle poll publication status.

**POST** `/api/polls/:id/publish`

#### Parameters

- `id` (number): Poll ID

#### Request Body

```json
{
  "published": true
}
```

### Get Poll Results

Retrieve aggregated results for a poll.

**GET** `/api/polls/:id/results`

#### Parameters

- `id` (number): Poll ID

#### Response

```json
{
  "pollId": 1,
  "totalVotes": 150,
  "questions": [
    {
      "questionId": 1,
      "questionText": "Who would you vote for?",
      "type": "single-choice",
      "totalResponses": 150,
      "choices": [
        {
          "optionId": 1,
          "optionText": "John Doe",
          "count": 90,
          "percentage": 60.0
        }
      ]
    }
  ]
}
```

---

## Voting System

### Cast Vote

Submit a vote for a poll competitor.

**POST** `/api/votes`

#### Request Body

```json
{
  "id": 1,
  "competitorId": 2,
  "voter_id": "unique_voter_identifier"
}
```

#### Response

**Success (200)**

```json
{
  "message": "Vote cast successfully."
}
```

**Error (403)**

```json
{
  "message": "You have already voted in this poll."
}
```

### Submit Poll Response

Submit responses to poll questions.

**POST** `/api/votes/submit-response`

#### Request Body

```json
{
  "pollId": 1,
  "responses": [
    {
      "questionId": 1,
      "responseType": "single-choice",
      "selectedOptionId": 2
    },
    {
      "questionId": 2,
      "responseType": "open-ended",
      "openEndedResponse": "My detailed response"
    }
  ],
  "respondentId": "unique_respondent_id"
}
```

### Get Vote Counts

Get vote counts for all competitors in a poll.

**GET** `/api/votes/:pollId/counts`

#### Parameters

- `pollId` (number): Poll ID

#### Response

```json
[
  {
    "competitor_id": 1,
    "competitor_name": "John Doe",
    "party": "Democratic Party",
    "vote_count": 45
  }
]
```

---

## Aspirants/Candidates

### Get Aspirant-Only Polls

Retrieve polls that only have competitors (no additional questions).

**GET** `/api/aspirant`

#### Response

```json
[
  {
    "id": 1,
    "title": "Presidential Race",
    "presidential": "yes",
    "category": "election",
    "region": "Nairobi",
    "county": "Nairobi",
    "constituency": "Westlands",
    "ward": "Parklands",
    "created_at": "2025-09-30T10:00:00Z",
    "voting_expires_at": "2025-10-30T23:59:59Z",
    "published": true,
    "is_competitor_only": true
  }
]
```

### Get Published Polls

Get list of published polls (titles only).

**GET** `/api/aspirant/published`

#### Response

```json
[
  {
    "id": 1,
    "title": "Presidential Election Poll"
  }
]
```

### Get Poll Competitors

Get all competitors for a specific poll.

**GET** `/api/aspirant/:pollId`

#### Parameters

- `pollId` (number): Poll ID

#### Response

```json
[
  {
    "id": 1,
    "name": "John Doe",
    "party": "Democratic Party",
    "profile_image": "base64_image_data",
    "poll_id": 1
  }
]
```

### Add Competitor

Add a new competitor to a poll.

**POST** `/api/aspirant/add-competitor/:pollId`

#### Parameters

- `pollId` (number): Poll ID

#### Request Body (multipart/form-data)

```
name: "Candidate Name"
party: "Party Name"
profileImage: [file upload]
```

---

## Blog Posts

### Get All Posts

Retrieve all blog posts.

**GET** `/api/blogs`

#### Response

```json
[
  {
    "id": 1,
    "title": "Election News Update",
    "content": "Latest news about the upcoming elections...",
    "images": ["base64_image_1", "base64_image_2"],
    "videos": ["base64_video_1"],
    "pdfs": ["base64_pdf_1"],
    "created_at": "2025-09-30T10:00:00Z"
  }
]
```

### Create Post

Create a new blog post with media attachments.

**POST** `/api/blogs/posts`

#### Request Body (multipart/form-data)

```
title: "Post Title"
content: "Post content here..."
media: [file uploads - up to 6 files: images, videos, PDFs]
```

#### Response

**Success (201)**

```json
{
  "message": "Blog post created successfully",
  "postId": 1
}
```

### Get Single Post

Retrieve a specific blog post.

**GET** `/api/blogs/:id`

#### Parameters

- `id` (number): Post ID

### Update Post

Update an existing blog post.

**PUT** `/api/blogs/:id`

#### Parameters

- `id` (number): Post ID

#### Request Body (multipart/form-data)

Same as create post.

### Delete Post

Delete a blog post.

**DELETE** `/api/blogs/:id`

#### Parameters

- `id` (number): Post ID

---

## Admin Operations

### Update Admin Password

Change admin user password.

**POST** `/api/update-admin`

#### Request Body

```json
{
  "email": "admin@example.com",
  "newPassword": "newSecurePassword123"
}
```

#### Response

**Success (200)**

```json
{
  "message": "Password updated successfully"
}
```

---

## Response Formats

### Success Response

```json
{
  "message": "Operation successful",
  "data": {
    /* response data */
  }
}
```

### Error Response

```json
{
  "message": "Error description",
  "error": "Detailed error information"
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Description           |
| ---- | --------------------- |
| 200  | Success               |
| 201  | Created               |
| 400  | Bad Request           |
| 401  | Unauthorized          |
| 403  | Forbidden             |
| 404  | Not Found             |
| 500  | Internal Server Error |

### Common Error Messages

- `"Invalid credentials"` - Wrong email/password
- `"Poll not found"` - Requested poll doesn't exist
- `"You have already voted in this poll"` - Duplicate vote attempt
- `"Competitor does not belong to the poll"` - Invalid competitor ID
- `"Server error"` - Database or internal error

---

## Data Types

### Poll Categories

- `"election"` - Electoral polls
- `"opinion"` - Opinion surveys
- `"survey"` - General surveys

### Question Types

- `"single-choice"` - Multiple choice (one selection)
- `"multiple-choice"` - Multiple choice (multiple selections)
- `"open-ended"` - Text response
- `"yes-no-notsure"` - Three-option choice

### File Types (Media Upload)

- **Images**: JPEG, JPG, PNG, GIF
- **Videos**: MP4, WebM, AVI, MOV
- **Documents**: PDF

### Limits

- **Media files per post**: 6 maximum
- **Images per post**: 3 maximum
- **Videos per post**: 3 maximum
- **PDFs per post**: 3 maximum

---

## Authentication Notes

Currently, the API uses simple email/password authentication. For production use, consider implementing:

- JWT tokens
- Session management
- Rate limiting
- CORS configuration
- Input validation middleware

---

## Testing the API

You can test the API endpoints using tools like:

- **Postman**
- **curl**
- **Insomnia**
- **VS Code REST Client**

### Example curl commands:

```bash
# Login
curl -X POST http://localhost:8802/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'

# Get all polls
curl -X GET http://localhost:8802/api/polls

# Cast a vote
curl -X POST http://localhost:8802/api/votes \
  -H "Content-Type: application/json" \
  -d '{"id":1,"competitorId":2,"voter_id":"voter123"}'
```
