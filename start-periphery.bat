@echo off
cd /d "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
set PORT=3001
set SPHERE_CONFIG=C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\sphere.config.json
node dist/index.js
