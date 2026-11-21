// 同系色タイムアタックの翻訳。通常のメッセージ辞書へ影響させない。
import {titleForTime} from '../rules/time-attack/v1/index.js';
import {TA_TITLES} from './time-attack-titles.js';
const keys=['mode','start','clear','quit','time','building','family','color','brightness','red','green','blue',
 'paused','resume','notCleared','unrankedQuestion','startError','anonymous','verifying','again','ranking','shareMode','shareRecord'];
const labels={
 ja:['タイムアタックモード','同系色モード','30棟クリア！','途中終了','タイム','建物','系統','色','明度','赤系','緑系','青系','一時停止','再開','未クリア','ランキングに接続できません。今回はランキング対象外で遊びますか？','開始できませんでした','ランキング対象外','記録を確認中','もう一度','ランキング','タイムアタックモード','記録'],
 en:['Time Attack Mode','Same-Color Mode','30 buildings cleared!','Quit','Time','Building','Color family','Color','Brightness','Red','Green','Blue','Paused','Resume','Not cleared','Ranking unavailable. Play without ranking this time?','Unable to start','Not ranked','Verifying result','Try again','Ranking','Time Attack Mode','Record'],
 es:['Modo contrarreloj','Modo de colores similares','¡30 edificios superados!','Salir','Tiempo','Edificio','Gama','Color','Brillo','Rojo','Verde','Azul','Pausa','Continuar','Sin completar','Ranking no disponible. ¿Jugar sin clasificación?','No se pudo iniciar','Sin clasificación','Verificando','Otra vez','Clasificación','Modo contrarreloj','Tiempo'],
 'pt-BR':['Modo contra o tempo','Modo de cores similares','30 prédios concluídos!','Sair','Tempo','Prédio','Família de cores','Cor','Brilho','Vermelho','Verde','Azul','Pausado','Continuar','Não concluído','Ranking indisponível. Jogar sem classificação?','Falha ao iniciar','Sem ranking','Verificando','Jogar de novo','Ranking','Modo contra o tempo','Tempo'],
 'zh-Hans':['计时挑战模式','同色系模式','完成30栋！','退出','时间','建筑','色系','颜色','亮度','红色系','绿色系','蓝色系','已暂停','继续','未通关','排行榜不可用，仍要以非排名方式游玩吗？','无法开始','不计排名','正在核实','再玩一次','排行榜','计时挑战模式','记录'],
 fr:['Mode contre-la-montre','Mode couleurs proches','30 bâtiments terminés !','Quitter','Temps','Bâtiment','Famille','Couleur','Luminosité','Rouge','Vert','Bleu','Pause','Reprendre','Non terminé','Classement indisponible. Jouer hors classement ?','Impossible de démarrer','Hors classement','Vérification','Rejouer','Classement','Mode contre-la-montre','Temps'],
 de:['Zeitangriffsmodus','Ähnliche-Farben-Modus','30 Gebäude geschafft!','Beenden','Zeit','Gebäude','Farbfamilie','Farbe','Helligkeit','Rot','Grün','Blau','Pause','Fortsetzen','Nicht geschafft','Rangliste nicht erreichbar. Ohne Rangliste spielen?','Start fehlgeschlagen','Ohne Rangliste','Wird geprüft','Nochmal','Rangliste','Zeitangriffsmodus','Zeit'],
 ko:['타임어택 모드','동일 계열 색상 모드','30개 건물 완료!','종료','시간','건물','색상 계열','색상','밝기','빨강 계열','초록 계열','파랑 계열','일시정지','재개','미완료','랭킹 연결 실패. 비랭킹으로 플레이할까요?','시작 실패','랭킹 제외','기록 확인 중','다시 하기','랭킹','타임어택 모드','기록'],
 ru:['Режим на время','Режим похожих цветов','30 зданий пройдено!','Выйти','Время','Здание','Гамма','Цвет','Яркость','Красная','Зелёная','Синяя','Пауза','Продолжить','Не завершено','Рейтинг недоступен. Играть без рейтинга?','Не удалось начать','Вне рейтинга','Проверка','Ещё раз','Рейтинг','Режим на время','Результат'],
 it:['Modalità a tempo','Modalità colori simili','30 edifici completati!','Esci','Tempo','Edificio','Famiglia di colori','Colore','Luminosità','Rosso','Verde','Blu','Pausa','Riprendi','Non completato','Classifica non disponibile. Giocare senza classifica?','Impossibile iniziare','Non classificato','Verifica in corso','Riprova','Classifica','Modalità a tempo','Tempo'],
 'zh-Hant':['計時挑戰模式','同色系模式','完成30棟！','退出','時間','建築','色系','顏色','亮度','紅色系','綠色系','藍色系','已暫停','繼續','未過關','排行榜無法連線，要以不計排名方式遊玩嗎？','無法開始','不計排名','正在核實','再玩一次','排行榜','計時挑戰模式','紀錄'],
 id:['Mode kejar waktu','Mode warna senada','30 gedung selesai!','Keluar','Waktu','Gedung','Kelompok warna','Warna','Kecerahan','Merah','Hijau','Biru','Jeda','Lanjutkan','Belum selesai','Peringkat tidak tersedia. Main tanpa peringkat?','Tidak bisa mulai','Tanpa peringkat','Memverifikasi','Main lagi','Peringkat','Mode kejar waktu','Rekor'],
 tr:['Zamana Karşı Mod','Benzer Renkler Modu','30 bina tamamlandı!','Çık','Süre','Bina','Renk grubu','Renk','Parlaklık','Kırmızı','Yeşil','Mavi','Duraklatıldı','Devam et','Tamamlanmadı','Sıralama kullanılamıyor. Sıralamasız oynansın mı?','Başlatılamadı','Sıralama dışı','Doğrulanıyor','Yeniden oyna','Sıralama','Zamana Karşı Mod','Süre'],
 vi:['Chế độ tính giờ','Chế độ màu cùng tông','Hoàn thành 30 tòa nhà!','Thoát','Thời gian','Tòa nhà','Nhóm màu','Màu','Độ sáng','Đỏ','Lục','Lam','Tạm dừng','Tiếp tục','Chưa hoàn thành','Không thể kết nối bảng xếp hạng. Chơi không xếp hạng?','Không thể bắt đầu','Không xếp hạng','Đang xác minh','Chơi lại','Xếp hạng','Chế độ tính giờ','Kỷ lục'],
 th:['โหมดจับเวลา','โหมดสีโทนเดียวกัน','ผ่านครบ 30 อาคาร!','ออก','เวลา','อาคาร','กลุ่มสี','สี','ความสว่าง','สีแดง','สีเขียว','สีน้ำเงิน','หยุดชั่วคราว','เล่นต่อ','ยังไม่สำเร็จ','ติดต่ออันดับไม่ได้ เล่นแบบไม่จัดอันดับหรือไม่?','เริ่มไม่ได้','ไม่นับอันดับ','กำลังตรวจสอบ','เล่นอีกครั้ง','อันดับ','โหมดจับเวลา','สถิติ']
};
const FINISH={
 ja:'30棟完走',en:'30 buildings completed',es:'30 edificios completados',
 'pt-BR':'30 prédios concluídos','zh-Hans':'完成30栋',fr:'30 bâtiments terminés',
 de:'30 Gebäude geschafft',ko:'30개 건물 완료',ru:'30 зданий пройдено',
 it:'30 edifici completati','zh-Hant':'完成30棟',id:'30 gedung selesai',
 tr:'30 bina tamamlandı',vi:'Hoàn thành 30 tòa nhà',th:'ผ่านครบ 30 อาคาร'
};
const replaceRun={
  "ja": "前のタイムアタックが続行中です。前の記録を途中終了として、新しく始めますか？",
  "en": "A time-attack run is still active. End that run and start a new one?",
  "es": "Hay una partida contrarreloj activa. ¿Terminarla y comenzar otra?",
  "pt-BR": "Há uma partida contra o tempo ativa. Encerrar e começar outra?",
  "zh-Hans": "仍有正在进行的计时挑战。结束上一局并开始新挑战吗？",
  "fr": "Une partie contre-la-montre est encore active. La terminer et recommencer ?",
  "de": "Ein Zeitangriff läuft noch. Diesen beenden und einen neuen starten?",
  "ko": "진행 중인 타임어택이 있습니다. 이전 플레이를 끝내고 새로 시작할까요?",
  "ru": "Есть активный забег на время. Завершить его и начать новый?",
  "it": "Una sfida a tempo è ancora attiva. Terminarla e ricominciare?",
  "zh-Hant": "仍有正在進行的計時挑戰。結束上一局並開始新挑戰嗎？",
  "id": "Masih ada permainan kejar waktu. Akhiri dan mulai yang baru?",
  "tr": "Devam eden bir zaman yarışı var. Bitirip yeniden başlansın mı?",
  "vi": "Vẫn có lượt chơi tính giờ đang diễn ra. Kết thúc lượt đó và bắt đầu lượt mới?",
  "th": "ยังมีการแข่งจับเวลาที่กำลังเล่นอยู่ ต้องการจบครั้งก่อนแล้วเริ่มใหม่หรือไม่?"
};
export function timeAttackText(key,language='ja'){
 if(key==='replaceRun')return replaceRun[language]??replaceRun.en;
 const words=labels[language]??labels.en,ix=keys.indexOf(key);
 return ix<0?key:(words[ix]??labels.en[ix]);
}
export function timeAttackTitle(cs,language='ja'){
 const key=titleForTime(cs);
 if(!key)return FINISH[language]??FINISH.en;
 const i=Number(key.slice(-2))-1;
 // 日本語の確定称号は厳密に保持。英語は対応訳、その他の言語には翻訳された
 // 「称号」という枠の中へ内容を表示する。固有名は順次自然訳を追加する。
 return (TA_TITLES[language]??TA_TITLES.en)[i];
}
export {TA_TITLES,labels,keys};
