// Kakao Maps JavaScript SDK에서 앱이 사용하는 최소 지도 타입을 선언하는 파일
interface KakaoLatLng {}

interface KakaoMapInstance {}

interface KakaoMarkerInstance {}

interface KakaoMapsApi {
  load(callback: () => void): void
  LatLng: new (lat: number, lon: number) => KakaoLatLng
  Map: new (element: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance
  Marker: new (options: { map: KakaoMapInstance; position: KakaoLatLng; title?: string }) => KakaoMarkerInstance
  InfoWindow: new (options: { content: string; removable?: boolean }) => { open(map: KakaoMapInstance, marker: KakaoMarkerInstance): void }
  event: { addListener(target: KakaoMarkerInstance, event: string, callback: () => void): void }
}

interface Window {
  kakao?: { maps: KakaoMapsApi }
}
