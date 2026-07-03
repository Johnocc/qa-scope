# 앱(Next.js: 화면 + API 라우트 = 채점 엔진) 개발용 이미지
FROM node:20-alpine

WORKDIR /app

# 의존성 레이어 캐시
COPY package*.json ./
RUN npm install

# 소스 (compose의 bind mount로 개발 중엔 덮임)
COPY . .

EXPOSE 3000

# 개발 서버 (핫리로드). 운영 배포 시엔 build 후 start 로 전환.
CMD ["npm", "run", "dev"]
