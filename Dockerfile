# Simple static hosting for AI 音樂生成器 using NGINX
FROM nginx:alpine

# Copy site files
COPY ./ /usr/share/nginx/html

# Expose port
EXPOSE 80

# Use default nginx.conf which serves /usr/share/nginx/html
# You can override with a custom config if needed.
