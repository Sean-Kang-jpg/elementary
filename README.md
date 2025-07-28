# 초등학교 배정 아파트 지도 - Supabase Migration

Google Apps Script에서 Supabase로 마이그레이션된 초등학교 배정 아파트 지도 서비스입니다.

## 파일 구조

```
/
├── index.html          # 메인 HTML 파일 (기존 UI 유지)
├── app.js             # Supabase API 연동 JavaScript
├── .env               # Supabase 설정 (보안상 제외)
└── README.md          # 이 파일
```

## 주요 변경사항

### 1. 데이터 소스 변경
- **기존**: Google Sheets
- **변경**: Supabase PostgreSQL Database

### 2. API 호출 변경
- **기존**: `google.script.run.getSchoolData()`
- **변경**: `fetch()` 를 사용한 Supabase REST API 호출

### 3. 데이터베이스 스키마
- **schools 테이블**: 학교 정보 및 학년별 데이터
- **apartments 테이블**: 아파트 정보 (학교와 연관)

## 로컬 테스트 방법

1. **웹 서버 실행**:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # 또는 Node.js
   npx serve .
   ```

2. **브라우저에서 접속**:
   ```
   http://localhost:8000
   ```

## 배포 방법

### 1. GitHub Pages
1. GitHub 리포지토리에 파일 업로드
2. Settings > Pages에서 소스를 main branch로 설정
3. 생성된 URL로 접속

### 2. Netlify
1. [Netlify](https://netlify.com)에 계정 생성
2. 폴더를 드래그 앤 드롭으로 배포
3. 생성된 URL로 접속

### 3. Vercel
1. [Vercel](https://vercel.com)에 계정 생성
2. 프로젝트 임포트 또는 파일 업로드
3. 자동 배포 완료

## 환경 설정

### Supabase 설정 (환경변수 사용)

#### 로컬 개발
1. `env.js` 파일에서 API 키 설정:
```javascript
// env.js
window.ENV = {
    SUPABASE_ANON_KEY: 'your_actual_supabase_anon_key'
};
```

#### 배포 환경

**GitHub Pages/정적 호스팅:**
1. `env.js` 파일에 직접 키 입력
2. 보안상 민감하지 않은 anon key만 사용

**Vercel/Netlify (서버리스):**
1. Build 시 환경변수를 사용하여 `env.js` 자동 생성
2. Build Command 예시:
```bash
echo "window.ENV = { SUPABASE_ANON_KEY: '$SUPABASE_ANON_KEY' };" > env.js && [build_command]
```

### 네이버 지도 API 설정 (index.html에서 수정)
```html
<script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_CLIENT_ID"></script>
```

## 주요 기능

1. **지역별 학교 검색**: 교육청별 필터링
2. **학년별 정보 표시**: 1-6학년 학급수/학생수
3. **아파트 정보**: 세대수, 주차, 연식 등
4. **지도 시각화**: 네이버 지도 기반 마커 표시
5. **모바일 최적화**: 반응형 디자인

## 기술 스택

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Supabase (PostgreSQL + REST API)
- **Maps**: Naver Maps API
- **Charts**: Chart.js

## 브라우저 호환성

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+
- Mobile Safari (iOS)
- Chrome Mobile (Android)