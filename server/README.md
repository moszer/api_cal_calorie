# Gemini Calorie API

A Node.js Express API that uses Google's Gemini AI to analyze food images and estimate calories and macronutrients. Features authentication with JWT tokens and API keys, user management, and a credit-based system for API usage.  

## Features

### Core Features
- Food image analysis using Google's Gemini AI
- Calorie and macronutrient estimation
- Detailed food item identification
- Health scoring and dietary categorization

### Authentication & Security
- JWT token-based authentication for web application
- API key authentication for external API usage
- User registration and login system
- Role-based access control (admin vs regular users)
- Secure password hashing

### API Management
- Credit-based API usage system
- API usage tracking and monitoring
- Credit transaction history
- Admin tools for user and credit management
  - User listing, editing, and deletion
  - Add credits to user accounts
  - Reset user's used credits
  - View credit transaction history

## Prerequisites

- Node.js (v14 or higher)
- Google Gemini API key
- MongoDB database (local or Atlas)

## Local Development

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with required environment variables:
   ```
   # API Keys
   GEMINI_API_KEY="your-gemini-api-key-here"
   
   # MongoDB Connection
   MONGO_URI="your-mongodb-connection-string"
   
   # JWT Authentication
   JWT_SECRET="your-jwt-secret-key"
   JWT_EXPIRE="30d"
   
   # Server Configuration
   PORT=8080
   NODE_ENV=development
   ```
4. Start the server:
   ```
   npm start
   ```
5. For client development, navigate to the client directory and install dependencies:
   ```
   cd client
   npm install
   npm run dev
   ```

   The client application will run on port 3001 by default and connect to the backend server on port 3002.

## Authentication System

The API supports two authentication methods:

### JWT Token Authentication

Used primarily for web application access. JWT tokens are issued upon login and used to authenticate subsequent requests.

- Tokens are valid for 30 days by default (configurable via `JWT_EXPIRE` env variable)
- Tokens should be included in the `Authorization` header as `Bearer <token>`
- Used for web client authentication

### API Key Authentication

Used primarily for external API access. API keys are generated per user and can be regenerated as needed.

- API keys are unique to each user
- API keys should be included in the `x-api-key` header
- Each API key request consumes credits from the user's balance
- Ideal for integration with external services

## Credit System

The API uses a credit-based system to manage and limit API usage:

- Each user starts with 100 API credits
- Each API request consumes 1 credit by default
- Different endpoints can be configured to consume different amounts of credits
- Admin users can add credits to user accounts
- Admin users can reset a user's used credits
- A complete transaction history is maintained for all credit operations
- When credits are exhausted, API requests return a 429 (Too Many Requests) error

## API Endpoints

### Authentication Endpoints

#### POST /api/users

Registers a new user account.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "_id": "user_id",
  "name": "John Doe",
  "email": "john@example.com",
  "isAdmin": false,
  "apiKey": "generated_api_key",
  "token": "jwt_token"
}
```

#### POST /api/users/login

Authenticate a user and receive a JWT token.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "_id": "user_id",
  "name": "John Doe",
  "email": "john@example.com",
  "isAdmin": false,
  "apiKey": "user_api_key",
  "token": "jwt_token"
}
```

#### GET /api/users/profile

Get the current user's profile information.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "_id": "user_id",
  "name": "John Doe",
  "email": "john@example.com",
  "isAdmin": false,
  "apiKey": "user_api_key",
  "apiCreditsUsed": 5,
  "apiCreditsTotal": 100,
  "apiCreditsRemaining": 95
}
```

#### POST /api/users/api-key

Regenerate the user's API key.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "apiKey": "new_api_key"
}
```

### Credit Management Endpoints

#### GET /api/credits

Get the current user's credit balance and transaction history.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Success Response (200 OK):**
```json
{
  "credits": {
    "total": 100,
    "used": 5,
    "remaining": 95
  },
  "transactions": [
    {
      "_id": "transaction_id_1",
      "user": "user_id",
      "amount": -1,
      "type": "consume",
      "description": "API request to /api/estimate-calories",
      "endpointPath": "/api/estimate-calories",
      "balanceAfter": 99,
      "createdAt": "2025-05-23T14:23:45.123Z",
      "updatedAt": "2025-05-23T14:23:45.123Z"
    }
  ]
}
```

---

#### POST /api/credits/:userId/add (Admin only)

Add credits to a specific user's account.

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**URL Parameters:**
- `userId`: The ID of the user to add credits to.

**Request Body:**
```json
{
  "amount": 50
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Credits added successfully.",
  "transaction": {
    "_id": "transaction_id_new",
    "user": "userId_of_target_user",
    "amount": 50,
    "type": "refill",
    "description": "Admin credit addition by Admin Name",
    "balanceAfter": 145,
    "createdAt": "2025-05-24T10:00:00.000Z",
    "updatedAt": "2025-05-24T10:00:00.000Z"
  },
  "updatedUser": {
     "_id": "userId_of_target_user",
     "name": "Target User Name",
     "email": "target@example.com",
     "apiCreditsTotal": 150,
     "apiCreditsUsed": 5,
     "isAdmin": false
  }
}
```
**Error Responses:**
- `400 Bad Request`: If `amount` is missing or invalid.
  ```json
  { "message": "Please provide a valid positive amount" }
  ```
- `404 Not Found`: If `userId` does not exist.
  ```json
  { "message": "User not found" }
  ```

---

#### POST /api/credits/:userId/reset (Admin only)

Reset a specific user's `apiCreditsUsed` to 0. Their `apiCreditsTotal` remains unchanged.

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**URL Parameters:**
- `userId`: The ID of the user whose credits are to be reset.

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "User credits reset successfully.",
  "transaction": {
    "_id": "transaction_id_reset",
    "user": "userId_of_target_user",
    "amount": 0,
    "type": "adjustment",
    "description": "Admin credit reset for user userId_of_target_user",
    "balanceAfter": 100,
    "createdAt": "2025-05-24T10:05:00.000Z",
    "updatedAt": "2025-05-24T10:05:00.000Z"
  },
  "updatedUser": {
     "_id": "userId_of_target_user",
     "name": "Target User Name",
     "email": "target@example.com",
     "apiCreditsTotal": 100,
     "apiCreditsUsed": 0,
     "isAdmin": false
  }
}
```
**Error Responses:**
- `404 Not Found`: If `userId` does not exist.
  ```json
  { "message": "User not found" }
  ```

---

#### GET /api/credits/all (Admin only)

Get a paginated list of all credit transactions across all users.

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**Query Parameters:**
- `page` (optional, default: 1): Page number for pagination.
- `limit` (optional, default: 20): Number of transactions per page.

**Success Response (200 OK):**
```json
{
  "transactions": [
    {
      "_id": "transaction_id_1",
      "user": {
        "_id": "user_id_1",
        "name": "User One",
        "email": "one@example.com"
      },
      "amount": -1,
      "type": "consume",
      "description": "API request to /api/estimate-calories",
      "endpointPath": "/api/estimate-calories",
      "balanceAfter": 99,
      "createdAt": "2025-05-24T12:00:00.000Z",
      "updatedAt": "2025-05-24T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "pages": 8
  }
}
```

---

#### GET /api/credits/:userId/history (Admin only)

Get the credit transaction history for a specific user.

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**URL Parameters:**
- `userId`: The ID of the user whose transaction history is being requested.

**Query Parameters:**
- `limit` (optional, default: 50): Maximum number of transactions to return.

**Success Response (200 OK):**
```json
{
  "success": true,
  "transactions": [
    {
      "_id": "transaction_id_user_specific",
      "user": "userId_of_target_user",
      "amount": -1,
      "type": "consume",
      "description": "API request to /api/estimate-calories",
      "endpointPath": "/api/estimate-calories",
      "balanceAfter": 79,
      "createdAt": "2025-05-24T09:00:00.000Z",
      "updatedAt": "2025-05-24T09:00:00.000Z"
    }
  ],
  "count": 25
}
```
**Error Responses:**
- `404 Not Found`: If `userId` does not exist.
  ```json
  { "message": "User not found" }
  ```

---

### Food Analysis Endpoints

Endpoints related to food image analysis and history.

#### POST /api/estimate-calories

Analyzes an uploaded food image using Google's Gemini AI to estimate calories, macronutrients, and provide other food-related details. Consumes one API credit.

**Authentication:**
- Requires JWT Token: `Authorization: Bearer <jwt_token>`
- OR API Key: `x-api-key: <user_api_key>`

**Request:**
- `Content-Type: multipart/form-data`
- Body: Form data with a single field `foodImage` containing the image file.

**Success Response (200 OK):**
The direct JSON response from the Gemini API (after internal parsing and default value filling). A `FoodAnalysis` document is also created and saved in the database.
```json
{
  "foodItems": [
    {
      "name": "Apple",
      "calories": "Approx. 95 kcal",
      "proteinGrams": "Approx. 0.5g",
      "carbsGrams": "Approx. 25g",
      "fatGrams": "Approx. 0.3g",
      "fiberGrams": "Approx. 4g",
      "sugarGrams": "Approx. 19g",
      "sodiumMg": "Approx. 2mg",
      "healthScore": 9,
      "dietaryCategory": ["Vegan", "Gluten-free", "Low-fat"],
      "potentialAllergens": []
    }
  ],
  "totalCalories": "Approx. 95 kcal",
  "totalProteinGrams": "Approx. 0.5g",
  "totalCarbsGrams": "Approx. 25g",
  "totalFatGrams": "Approx. 0.3g",
  "totalFiberGrams": "Approx. 4g",
  "totalSugarGrams": "Approx. 19g",
  "totalSodiumMg": "Approx. 2mg",
  "overallHealthScore": 9,
  "mealType": "Snack",
  "caloriesDensity": "Low density (0.5 kcal/g)",
  "portionRecommendation": "One medium apple is a standard serving.",
  "description": "A fresh red apple, a healthy and fibrous snack.",
  "analysisId": "mongodb_object_id_of_the_saved_analysis"
}
```
*(Note: The `analysisId` field is added by the server after successfully saving the analysis result to the database. It corresponds to the `_id` of the `FoodAnalysis` document.)*

**Error Responses:**
- `400 Bad Request`: If `foodImage` is missing or not an image.
  ```json
  { "error": "Please upload an image file" }
  { "error": "Only image files are allowed!" }
  ```
- `401 Unauthorized`: If JWT token/API key is missing or invalid.
- `429 Too Many Requests`: If the user has insufficient API credits.
  ```json
  {
    "error": "Insufficient credits to perform this action.",
    "credits": { "used": 100, "total": 100, "remaining": 0 }
  }
  ```
- `500 Internal Server Error`: If Gemini API or parsing fails.
  ```json
  { "error": "Failed to analyze image with Gemini API" }
  ```

---

#### GET /api/food-analyses

Get all food analyses for the logged-in user, sorted by most recent.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Query Parameters:**
- `date` (optional): Filter analyses by a specific date (format: `YYYY-MM-DD`).

**Success Response (200 OK):**
An array of `FoodAnalysis` documents.
```json
[
  {
    "_id": "analysis_id_1",
    "user": "user_id_logged_in",
    "foodItems": [
      {
        "name": "Apple", 
        "calories": "Approx. 95 kcal",
        "_id": "food_item_id_1"
      }
    ],
    "totalCalories": "Approx. 95 kcal",
    "description": "A fresh red apple...",
    "createdAt": "2025-05-24T10:30:00.000Z",
    "updatedAt": "2025-05-24T10:30:00.000Z"
  }
]
```
**Error Responses:**
- `500 Internal Server Error`: ` { "message": "Failed to fetch food analyses" } `

---

#### GET /api/food-analyses/:id

Get a specific food analysis by its ID, belonging to the logged-in user.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**URL Parameters:**
- `id`: The ID of the food analysis to retrieve.

**Success Response (200 OK):**
A single `FoodAnalysis` document.
```json
{
  "_id": "analysis_id_1",
  "user": "user_id_logged_in",
  "foodItems": [
    {
      "name": "Apple", 
      "calories": "Approx. 95 kcal", 
      "_id": "food_item_id_1"
    }
  ],
  "totalCalories": "Approx. 95 kcal",
  "description": "A fresh red apple...",
  "createdAt": "2025-05-24T10:30:00.000Z",
  "updatedAt": "2025-05-24T10:30:00.000Z"
}
```
**Error Responses:**
- `404 Not Found`: ` { "message": "Food analysis not found" } `
- `500 Internal Server Error`: ` { "message": "Failed to fetch food analysis" } `

---

#### DELETE /api/food-analyses/:id

Delete a specific food analysis by its ID, belonging to the logged-in user.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**URL Parameters:**
- `id`: The ID of the food analysis to delete.

**Success Response (200 OK):**
```json
{ "message": "Food analysis deleted" }
```
**Error Responses:**
- `404 Not Found`: ` { "message": "Food analysis not found" } `
- `500 Internal Server Error`: ` { "message": "Failed to delete food analysis" } `

---

### Admin User Management Endpoints

Endpoints for administrators to manage user accounts. All require admin privileges.

#### GET /api/users (Admin only)

Get a list of all users in the system. Passwords are excluded.

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**Success Response (200 OK):**
An array of user objects.
```json
[
  {
    "_id": "user_id_1",
    "name": "John Doe",
    "email": "john@example.com",
    "isAdmin": false,
    "apiKey": "johns_api_key",
    "apiCreditsUsed": 10,
    "apiCreditsTotal": 100,
    "createdAt": "2025-05-20T10:00:00.000Z",
    "updatedAt": "2025-05-21T11:00:00.000Z"
  }
]
```

---

#### GET /api/users/:id (Admin only)

Get details for a specific user by their ID. Password is excluded.

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**URL Parameters:**
- `id`: The ID of the user to retrieve.

**Success Response (200 OK):**
```json
{
  "_id": "user_id_1",
  "name": "John Doe",
  "email": "john@example.com",
  "isAdmin": false,
  "apiKey": "johns_api_key",
  "apiCreditsUsed": 10,
  "apiCreditsTotal": 100,
  "createdAt": "2025-05-20T10:00:00.000Z",
  "updatedAt": "2025-05-21T11:00:00.000Z"
}
```
**Error Responses:**
- `404 Not Found`: ` { "message": "User not found" } `

---

#### PUT /api/users/:id (Admin only)

Update a specific user's information (name, email, admin status).

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**URL Parameters:**
- `id`: The ID of the user to update.

**Request Body:**
Fields are optional. Only provided fields will be updated.
```json
{
  "name": "Johnathan Doe",
  "email": "john.doe.new@example.com",
  "isAdmin": false
}
```

**Success Response (200 OK):**
The updated user object (excluding password and apiKey).
```json
{
  "_id": "user_id_1",
  "name": "Johnathan Doe",
  "email": "john.doe.new@example.com",
  "isAdmin": false
}
```
**Error Responses:**
- `404 Not Found`: ` { "message": "User not found" } `

---

#### DELETE /api/users/:id (Admin only)

Delete a specific user account from the system.

**Headers:**
- `Authorization: Bearer <jwt_token>` (User must be an admin)

**URL Parameters:**
- `id`: The ID of the user to delete.

**Success Response (200 OK):**
```json
{ "message": "User removed" }
```
**Error Responses:**
- `404 Not Found`: ` { "message": "User not found" } `

---

## Common Error Responses

Besides endpoint-specific errors:

- **400 Bad Request:** The request was malformed (e.g., missing required fields, invalid data types). The response body often contains a `message` field explaining the error.
- **401 Unauthorized:** Authentication failed. This could be due to a missing, invalid, or expired JWT token, or an invalid API key.
  - `{"message": "Not authorized, no token"}`
  - `{"message": "Not authorized, token failed"}`
  - `{"message": "Invalid API key or user not found"}` (for API key auth)
- **403 Forbidden:** The authenticated user does not have permission to access the requested resource (e.g., a regular user trying to access an admin-only endpoint).
  - `{"message": "Not authorized as an admin"}`
- **404 Not Found:** The requested resource could not be found (e.g., non-existent user ID, analysis ID).
- **429 Too Many Requests:** The user has exhausted their API credits. The response body includes current credit status.
- **500 Internal Server Error:** An unexpected error occurred on the server. The response body may contain a generic error message.

## Future Enhancements

- More detailed Gemini prompt options
- User ability to correct/edit analysis results
- Batch image analysis
- Support for different image upload methods (e.g., URL)
- More granular credit consumption settings per endpoint or feature


## Client Integration

The API includes a React client application that demonstrates how to use the API, including:

- User registration and login
- Protected routes
- Profile management
- API key generation
- Calorie estimation
- API credit tracking
- Admin user management

The client can be found in the `client` directory and runs on port 3001 by default. The client connects to the backend API running on port 3002 via a proxy configuration in the `vite.config.js` file.

## การใช้งาน API (API Usage - Thai)

### ระบบการทำงานของ API

API นี้ใช้ในการวิเคราะห์รูปภาพอาหารและประมาณค่าแคลอรี่และสารอาหารโดยใช้ AI ของ Google Gemini โดยมีระบบการทำงานหลักดังนี้:

#### 1. ระบบการยืนยันตัวตน (Authentication)

API รองรับการยืนยันตัวตน 2 รูปแบบ:

- **JWT Token**: สำหรับการใช้งานผ่านเว็บแอปพลิเคชัน โดยจะได้รับ token หลังจากการล็อกอินและมีอายุ 30 วัน
- **API Key**: สำหรับการใช้งานจากภายนอก โดยแต่ละผู้ใช้จะมี API key เฉพาะที่สามารถสร้างใหม่ได้

#### 2. ระบบเครดิตการใช้งาน (API Credit System)

- ผู้ใช้แต่ละรายได้รับเครดิตเริ่มต้น 100 เครดิต
- การใช้งาน API แต่ละครั้งจะถูกหักเครดิต 1 หน่วย
- เมื่อเครดิตหมด จะไม่สามารถใช้งาน API ได้ (HTTP 429 Too Many Requests)
- ผู้ดูแลระบบสามารถเพิ่มเครดิตหรือรีเซ็ตเครดิตที่ใช้ไปให้ผู้ใช้งานได้

#### 3. การเรียกใช้งาน API

##### การประมาณค่าแคลอรี่

```bash
# ใช้ JWT Token
curl -X POST -H "Authorization: Bearer <your_jwt_token>" \
  -F "foodImage=@path/to/image.jpg" \
  http://localhost:8080/api/estimate-calories

# ใช้ API Key
curl -X POST -H "x-api-key: <your_api_key>" \
  -F "foodImage=@path/to/image.jpg" \
  http://localhost:8080/api/estimate-calories
```

##### การดูสถานะเครดิต

```bash
curl -X GET -H "Authorization: Bearer <your_jwt_token>" \
  http://localhost:8080/api/credits
```

#### 4. ผลลัพธ์การวิเคราะห์

ผลลัพธ์จากการวิเคราะห์รูปภาพอาหารจะประกอบด้วย:

- รายการอาหารที่ตรวจพบในภาพ
- ค่าแคลอรี่โดยประมาณ (ทั้งหมดและแยกตามรายการอาหาร)
- ปริมาณสารอาหารโดยประมาณ (โปรตีน, คาร์โบไฮเดรต, ไขมัน)
- คะแนนด้านสุขภาพ
- คำแนะนำเกี่ยวกับขนาดมื้ออาหาร

#### 5. การจัดการข้อมูลผู้ใช้ (สำหรับผู้ดูแลระบบ)

ผู้ดูแลระบบสามารถ:

- ดูรายชื่อผู้ใช้ทั้งหมดในหน้า Admin User List
- แก้ไขข้อมูลผู้ใช้ (ชื่อ, อีเมล, สถานะแอดมิน)
- ลบผู้ใช้ออกจากระบบ
- เพิ่มเครดิตให้ผู้ใช้ (สามารถกำหนดจำนวนเครดิตที่ต้องการเพิ่ม)
- รีเซ็ตเครดิตที่ถูกใช้ไปแล้วให้ผู้ใช้
- ดูประวัติการใช้งานเครดิตของผู้ใช้ในรูปแบบตาราง

การเข้าถึงหน้าจัดการผู้ใช้:

1. ล็อกอินด้วยบัญชีที่มีสิทธิ์แอดมิน
2. ไปที่เมนู "Admin" และเลือก "User List"
3. บริหารจัดการผู้ใช้ได้ตามต้องการผ่านหน้า Admin User List

## Deployment

1. Install Vercel CLI (optional):
   ```
   npm install -g vercel
   ```

2. Deploy using Vercel CLI:
   ```
   vercel
   ```

3. Or connect your GitHub repository to Vercel for automatic deployments

4. Add your `GEMINI_API_KEY` as an environment variable in the Vercel project settings

## Important Notes

- The API requires a valid Google Gemini API key to function
- Image uploads are limited to 10MB
- Only image files are accepted
