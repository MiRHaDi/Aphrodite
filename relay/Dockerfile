FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
