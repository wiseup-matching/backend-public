FROM node:22

WORKDIR /app

COPY . .

RUN npm install
RUN npm run build

EXPOSE 4000                         
CMD ["npm","start"]
