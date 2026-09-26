# LUCKY 45

역대 로또6/45 데이터를 분석해 패턴 적합도 상위 10개 조합을 보여주는 Android 전용 앱입니다. 럭셔리 모터스포츠의 긴장감과 정밀함을 참고하되 특정 자동차 브랜드의 로고, 이미지, 서체는 사용하지 않습니다.

## 주요 기능

- 전체 빈도, 최근 가중 빈도, 번호 쌍, 조합 형태를 결합한 추천 TOP 10
- 다음 회차를 시드로 사용해 같은 회차에는 동일한 추천 결과 제공
- 1회부터 최신 회차까지 당첨번호와 1·2등 당첨 판매점 조회
- 현재 위치 기준 가까운 공식 로또 판매점 20곳과 역대 1·2등 당첨 횟수 표시
- 사용자가 선택하고 기기에 저장되는 라이트·다크 테마
- Kakao Maps 키가 있으면 Kakao 지도, 없거나 연결에 실패하면 OpenStreetMap 사용
- GitHub 원격 JSON을 통한 회차·당첨점·판매점 데이터 동기화
- 네트워크 장애 시 캐시 또는 APK 내장 데이터 사용
- GitHub Actions를 통한 주간 데이터 갱신과 APK 빌드

## 로컬 실행

```bash
npm ci
npm run dev
```

## 검증

```bash
npm run test:run
npm run build
```

## Android 동기화

```bash
npm run android:sync
```

APK는 GitHub Actions의 `Build Release APK` 실행 결과에서 `lucky-45-release-apk`를 내려받아 설치할 수 있습니다. Actions 실행 번호가 Android `versionCode`가 되므로 동일한 서명키로 만든 다음 버전을 기존 앱 위에 설치할 수 있습니다.

## Release APK 서명

GitHub Actions에는 아래 네 가지 Repository secret이 필요합니다. 서명키 원본과 비밀번호는 저장소에 커밋하지 않고 별도로 안전하게 백업해야 합니다. 서명키를 잃으면 기존 설치 앱을 업데이트할 수 없습니다.

- `ANDROID_KEYSTORE_BASE64`는 PKCS12 서명키 파일 전체를 Base64로 변환한 값입니다.
- `ANDROID_KEYSTORE_PASSWORD`는 키 저장소 비밀번호입니다.
- `ANDROID_KEY_ALIAS`는 서명키 별칭이며 기본값은 `lucky45`입니다.
- `ANDROID_KEY_PASSWORD`는 개별 키 비밀번호입니다.

## Kakao Maps 설정

Kakao Developers에서 앱을 만든 뒤 JavaScript 키를 발급하고 JavaScript SDK 도메인에 로컬 개발 주소와 Android WebView 주소를 등록합니다.

- 로컬 개발은 `http://127.0.0.1:5173`입니다.
- Android 앱은 Capacitor 기본 주소인 `https://localhost`입니다.
- 로컬에서는 `.env.example`을 `.env.local`로 복사한 뒤 `VITE_KAKAO_MAP_JAVASCRIPT_KEY`에 키를 입력합니다.
- GitHub Actions에서는 저장소의 Actions secret `KAKAO_MAP_JAVASCRIPT_KEY`에 같은 키를 등록합니다.

키를 설정하지 않아도 앱은 OpenStreetMap으로 정상 동작합니다.

## 데이터 흐름

매주 일요일 00시와 일요일 05시 KST에 GitHub Actions가 동행복권의 공개 응답을 확인해 최신 회차, 역대 회차와 회차별 당첨 판매점을 갱신합니다. 자정에 새 회차를 1차 수집하고 새벽 5시에 한 번 더 확인합니다. 전국 판매점 목록은 28일마다 새로 확인합니다. 설치된 APK는 실행할 때 GitHub 원격 JSON을 확인하므로 앱을 다시 설치하지 않아도 최신 데이터를 표시합니다.

- `public/data/history.json`은 1회부터 최신 회차까지의 당첨번호입니다.
- `data/winners/####.json`은 회차별 1·2등 당첨 판매점입니다.
- `public/data/stores.json`은 위치 계산과 판매점별 역대 1·2등 횟수 표시에 사용하는 전국 판매점입니다.

## 주의 사항

모든 6개 번호 조합의 실제 1등 확률은 `1 / 8,145,060`으로 같습니다. 앱의 점수는 과거 데이터와의 패턴 유사도이며 당첨확률을 높이거나 당첨을 보장하지 않습니다. 실제 당첨 여부와 판매점 영업 여부는 반드시 동행복권 공식 정보와 실물 복권으로 확인해야 합니다.
