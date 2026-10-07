# 로그인 공급자 설정 체크리스트 (A2-B04-b)

작성 2026-10-07. 대상: 카카오·구글 로그인을 켜기 전에 사용자가 콘솔에서 직접 할 일. 코드 배포와는 별개이며, 여기 적은 설정만으로는 사이트에 로그인 버튼이 생기지 않는다.

비밀값(Client Secret, REST API 키 등)은 Supabase 대시보드에만 입력한다. 저장소·문서·채팅에 붙여 넣지 않는다.

## 현재 상태 (2026-10-06 공개 settings 조회)

email=true, kakao=false, google=false, anonymous=false, disable_signup=false, mailer_autoconfirm=false. 관리자 화면(`/admin/etl`)은 email/password 로그인이다. 아래 설정은 이 로그인에 영향을 주지 않는다.

공통 콜백 주소(두 공급자 모두 이 값을 등록):

```
https://vsgeksumgvcrkzjwvlgs.supabase.co/auth/v1/callback
```

## 1. Supabase — URL 설정 (먼저)

Authentication → URL Configuration

- [ ] Site URL: `https://wherecho.co.kr`
- [ ] Redirect URLs에 추가: `https://wherecho.co.kr/**`, 로컬 개발용 `http://127.0.0.1:3000/**`, `http://localhost:3000/**`
- [ ] Vercel 미리보기 주소에서 로그인을 시험하려면 그 주소 패턴도 추가(운영과 분리할지 결정 필요)

## 2. 카카오 (우선)

[Kakao Developers](https://developers.kakao.com) → 내 애플리케이션

- [ ] 애플리케이션 추가(앱 이름 "어디초", 사업자명은 운영 주체 기준)
- [ ] 플랫폼 → Web 사이트 도메인: `https://wherecho.co.kr`
- [ ] 카카오 로그인 활성화 ON, Redirect URI에 위 공통 콜백 주소
- [ ] 보안 → Client Secret 발급·활성화
- [ ] 동의항목: 최소 수집 원칙(Audit 1 P3-05: 아이 이름·성별·정확 주소 수집 없음). 닉네임은 선택 동의로 충분한지 결정
- [ ] **이메일(account_email) 확인 필요**: Supabase 카카오 로그인이 이메일 동의를 요구하는지, 카카오에서 이메일 동의항목을 쓰려면 비즈 앱 전환이 필요한지 콘솔에서 확인한다. 이메일 없이 운영할지는 계정 병합 규칙(Audit 1 P3-04)과 함께 정한다
- [ ] Supabase → Authentication → Providers → Kakao: Enable, Client ID = REST API 키, Client Secret = 위에서 발급한 값

## 3. 구글

[Google Cloud Console](https://console.cloud.google.com) → API 및 서비스

- [ ] OAuth 동의 화면: 외부, 앱 이름·지원 이메일·개인정보처리방침 `https://wherecho.co.kr/privacy`, 범위는 email·profile·openid만
- [ ] 사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션), 승인된 리디렉션 URI에 위 공통 콜백 주소
- [ ] 게시 상태: 테스트 단계에서는 테스트 사용자만 로그인 가능하므로 공개 전 "프로덕션" 전환
- [ ] Supabase → Providers → Google: Enable, Client ID/Secret 입력

## 4. 계정 연결·익명 로그인 (결정 후 설정)

- [ ] Manual identity linking: 같은 사람이 카카오·구글을 모두 쓸 때 연결 허용 여부. Audit 1 §4의 병합 규칙(저장은 합집합, 프로필 충돌은 사용자 선택)을 정한 뒤 켠다
- [ ] Anonymous sign-ins: 현재 꺼짐. 비로그인 상태를 기기 저장으로 유지하는 지금 계획에서는 켤 필요가 없다. 커리큘럼 기능(`src/lib/voter.ts`, 플래그 꺼짐)이 이를 쓰지만 노출되지 않는다

## 5. 끝나면 알려 줄 것

설정을 마쳤다는 사실과, 카카오 이메일 동의 여부만 알려 주면 된다. 그러면 다음을 진행한다.

- 공개 settings 재조회로 kakao/google=true 확인(비밀값 노출 없음)
- 로컬 개발 서버에서 로그인·취소·로그아웃·return path 확인
- 관리자 email 로그인 회귀 확인
- 그 결과로 OPERATION_PLAN A2-B04-b를 체크한다
