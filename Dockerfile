
# Use the official Node.js 24 Alpine image
FROM node:24-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy dependency definition files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY src/ ./src/
COPY public/ ./public/
COPY database/ ./database/

# Run the application as a non-root user
USER node

# Tell Docker the application listens on port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
