FROM nginx:alpine

# Copy nginx configuration
COPY docker_compose_sphere_v1/services/nginx/nginx.conf /etc/nginx/nginx.conf

# Copy Sphere UI static files
COPY sphere-ui/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
