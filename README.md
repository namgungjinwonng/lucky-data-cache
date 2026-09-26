# LUCKY 45

행운의 여섯 번호를 만드는 Android 전용 번호 추첨기입니다. 럭셔리 모터스포츠의 긴장감과 정밀함을 참고하되 특정 자동차 브랜드의 로고, 이미지, 서체는 사용하지 않습니다.

## 주요 기능

- 1게임부터 5게임까지 무작위 번호 생성
- 고정수와 제외수 선택
- 최근 생성 기록 기기 저장
- GitHub 원격 JSON을 통한 최신 당첨번호 동기화
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

APK는 GitHub Actions의 `Build Android APK` 실행 결과에서 받을 수 있습니다.

## 데이터 흐름

매주 일요일 GitHub Actions가 동행복권의 공개 응답을 확인해 `public/data/latest.json`을 갱신합니다. 설치된 APK는 실행할 때 GitHub 원격 JSON을 확인하므로 앱을 다시 설치하지 않아도 최신 회차를 표시합니다.

## 주의 사항

이 앱은 번호 생성을 돕는 도구이며 당첨을 예측하거나 보장하지 않습니다. 실제 당첨 여부는 반드시 동행복권 공식 결과와 실물 복권으로 확인해야 합니다.
