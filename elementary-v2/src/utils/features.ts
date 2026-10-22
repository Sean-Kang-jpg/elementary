/**
 * 아직 운영에 내지 않은 화면의 스위치.
 *
 * 학교앞마당(docs/product/FRONTYARD_PLAN.md)은 SQL 33과 익명 로그인이 운영에 준비될 때까지
 * `VITE_FRONTYARD_ENABLED=1`일 때만 메뉴에 나온다. 개발 서버에서는 항상 켠다. 꺼져 있어도
 * `/frontyard` 주소는 열리므로(링크 공유 대비) 메뉴만 숨긴다.
 * `import.meta.env.DEV`는 그대로 적어야 Vite가 바꿔 넣는다(dataService.ts의 ViteMeta 주석).
 */
export const FRONTYARD_ENABLED = Boolean(
  (import.meta as ImportMeta & { env: { DEV?: boolean } }).env.DEV
  || (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_FRONTYARD_ENABLED === '1',
)
