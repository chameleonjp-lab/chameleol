// Each localized row follows the same key order. Keep interpolated values intact.
const keys = [
  'home', 'homeNote', 'mode', 'instructions', 'start', 'preparing',
  'retry', 'localStart', 'startFailed', 'storageFailed',
  'continueWithoutSaving', 'offlineQueue',
  'building', 'time', 'hold', 'color', 'brightness', 'target', 'current',
  'travel', 'paused', 'resume', 'quit', 'family.red', 'family.green', 'family.blue',
  'clearTime', 'cleared', 'quitSummary', 'best', 'newBest', 'again', 'homeAction',
  'status.official', 'status.noRank', 'status.rejected', 'status.tooLarge', 'shareRecord',
  'activeElsewhere', 'buildingLabel', 'timeLabel', 'familyLabel', 'colorLabel', 'brightnessLabel', 'holdLabel', 'pause',
];

const localized = {
  ja: `
同系色モード
タイムアタック・30棟
タイムアタックモード
同じ色系統で30棟に挑戦。90%以上の一致を0.5秒キープしよう。15棟目からは明るさも合わせます。条件を満たすと次の建物にすぐ切り替わります。一時停止中の時間は記録に含みません。
はじめる
準備中…
もう一度接続する
今回だけランキング対象外で始める
ランキングに接続できませんでした。
端末に記録を保存できませんでした。
保存せずに遊ぶ
接続が戻りしだい、保存した記録を送ります。
{count} / 30棟
タイム {time}
キープ {time}
色の一致度 {match}
明るさの一致度 {match}
目標の色
いまの色
次の建物へ移動中
一時停止中
再開する
ここで終了する
赤系
緑系
青系
今回の30棟クリアタイム
30棟完走
途中終了・{count} / 30棟クリア
端末の自己ベスト {time}
自己ベスト更新！
もう一度
ホーム
記録を確認しました。ランキングには自己ベストが反映されます。
今回はランキングに順位がつきません。
この結果はランキングに登録できませんでした。
操作の記録が大きすぎるため、ランキングに送れません。
記録：{time}
別のタブでタイムアタックをプレイ中です。
建物
タイム
色系統
色の一致度
明るさの一致度
キープ時間
一時停止
`,
  en: `
Single-color mode
Time Attack · 30 buildings
Time Attack Mode
Take on 30 buildings in one color family. Hold a match of 90% or higher for 0.5 seconds. Match brightness too from building 15. The next building appears immediately. Pauses are off the clock.
Start
Getting ready…
Try connecting again
Play this run without ranking
Could not connect to the rankings.
Could not save the record to this device.
Play without saving
Saved records will be sent when you reconnect.
Building {count} / 30
Time {time}
Hold {time}
Color match {match}
Brightness match {match}
Target color
Your color
Moving to the next building
Paused
Resume
End this run
Red family
Green family
Blue family
Your 30-building clear time
30 buildings cleared
Run ended early · {count} / 30 buildings cleared
Device best {time}
New personal best!
Play again
Home
Record verified. The rankings show your personal best.
This run does not earn a rank.
This result could not be ranked.
The input history is too large to send to the rankings.
Time: {time}
Time Attack is running in another tab.
Building
Time
Color family
Color match
Brightness match
Hold time
Pause
`,
  es: `
Modo de una gama de color
Contrarreloj · 30 edificios
Modo contrarreloj
Recorre 30 edificios de una misma gama. Mantén una coincidencia del 90 % o más durante 0,5 segundos. A partir del edificio 15, iguala también el brillo. El siguiente edificio aparece de inmediato. Las pausas quedan fuera del cronómetro.
Empezar
Preparando…
Volver a conectar
Jugar esta partida sin clasificación
No se pudo conectar con la clasificación.
No se pudo guardar la marca en este dispositivo.
Jugar sin guardar
Las marcas guardadas se enviarán al recuperar la conexión.
Edificio {count} / 30
Tiempo {time}
Mantén {time}
Coincidencia de color {match}
Coincidencia de brillo {match}
Color objetivo
Tu color
En camino al siguiente edificio
En pausa
Continuar
Terminar la partida
Gama de rojos
Gama de verdes
Gama de azules
Tu tiempo en los 30 edificios
30 edificios completados
Partida sin terminar · {count} / 30 edificios completados
Mejor marca del dispositivo {time}
¡Nueva marca personal!
Jugar de nuevo
Inicio
Marca verificada. La clasificación muestra tu mejor marca.
Esta partida no obtiene un puesto.
Este resultado no se pudo clasificar.
El historial de acciones es demasiado grande para enviarlo a la clasificación.
Tiempo: {time}
Hay una contrarreloj en curso en otra pestaña.
Edificio
Tiempo
Gama de colores
Coincidencia de color
Coincidencia de brillo
Tiempo mantenido
Pausar
`,
  'pt-BR': `
Modo de uma família de cores
Contra o relógio · 30 prédios
Modo contra o relógio
Passe por 30 prédios da mesma família de cores. Mantenha uma correspondência de 90% ou mais por 0,5 segundo. A partir do 15º prédio, ajuste também o brilho. O próximo prédio aparece na hora. As pausas ficam fora do cronômetro.
Começar
Preparando…
Tentar conectar de novo
Jogar esta partida sem classificação
Não foi possível conectar à classificação.
Não foi possível salvar o tempo neste dispositivo.
Jogar sem salvar
Os tempos salvos serão enviados quando a conexão voltar.
Prédio {count} / 30
Tempo {time}
Mantenha {time}
Correspondência de cor {match}
Correspondência de brilho {match}
Cor-alvo
Sua cor
Indo para o próximo prédio
Pausa
Continuar
Encerrar a partida
Tons de vermelho
Tons de verde
Tons de azul
Seu tempo nos 30 prédios
30 prédios concluídos
Partida encerrada · {count} / 30 prédios concluídos
Melhor tempo do dispositivo {time}
Novo recorde pessoal!
Jogar de novo
Início
Tempo verificado. A classificação mostra seu melhor tempo.
Esta partida não recebe uma posição.
Não foi possível classificar este resultado.
O histórico de ações é grande demais para ser enviado à classificação.
Tempo: {time}
Há uma partida contra o relógio em outra aba.
Prédio
Tempo
Família de cores
Correspondência de cor
Correspondência de brilho
Tempo mantido
Pausar
`,
  'zh-Hans': `
同色系模式
限时竞速 · 30 栋
限时竞速模式
挑战同一色系的 30 栋建筑。匹配度达到 90% 后保持 0.5 秒。从第 15 栋起还要匹配亮度。达标后立即切换到下一栋建筑。暂停时间不计入成绩。
开始
准备中…
重新连接
本局不参与排名
无法连接排行榜。
无法将记录保存到此设备。
不保存，继续玩
连接恢复后会发送已保存的记录。
第 {count} / 30 栋
用时 {time}
保持 {time}
颜色匹配度 {match}
亮度匹配度 {match}
目标颜色
当前颜色
正在前往下一栋
已暂停
继续
结束本局
红色系
绿色系
蓝色系
本次 30 栋通关用时
已完成 30 栋
提前结束 · 已完成 {count} / 30 栋
本机最佳 {time}
刷新个人最佳！
再玩一次
主页
成绩已核实。排行榜显示你的个人最佳成绩。
本局没有排名。
该成绩未能进入排行榜。
操作记录过大，无法发送到排行榜。
成绩：{time}
计时挑战正在另一个标签页中进行。
建筑
用时
色系
颜色匹配度
亮度匹配度
保持时间
暂停
`,
  fr: `
Mode à gamme unique
Contre-la-montre · 30 bâtiments
Mode contre-la-montre
Enchaînez 30 bâtiments de la même gamme de couleurs. Maintenez une correspondance d’au moins 90 % pendant 0,5 seconde. À partir du bâtiment 15, ajustez aussi la luminosité. Le bâtiment suivant apparaît aussitôt. Les pauses sont hors chrono.
Commencer
Préparation…
Retenter la connexion
Jouer cette partie hors classement
Impossible de se connecter au classement.
Impossible d’enregistrer le temps sur cet appareil.
Jouer sans enregistrer
Les temps enregistrés seront envoyés au retour de la connexion.
Bâtiment {count} / 30
Temps {time}
Maintien {time}
Correspondance de la couleur {match}
Correspondance de la luminosité {match}
Couleur cible
Votre couleur
En route vers le bâtiment suivant
En pause
Reprendre
Terminer la partie
Gamme de rouges
Gamme de verts
Gamme de bleus
Votre temps sur les 30 bâtiments
30 bâtiments franchis
Partie interrompue · {count} / 30 bâtiments franchis
Meilleur temps sur cet appareil {time}
Nouveau record personnel !
Rejouer
Accueil
Temps vérifié. Le classement affiche votre meilleur temps.
Cette partie ne donne pas de rang.
Ce résultat n’a pas pu être classé.
L’historique des actions est trop volumineux pour être envoyé au classement.
Temps : {time}
Une partie contre-la-montre est en cours dans un autre onglet.
Bâtiment
Temps
Gamme de couleurs
Correspondance de la couleur
Correspondance de la luminosité
Durée du maintien
Mettre en pause
`,
  de: `
Einfarbmodus
Zeitrennen · 30 Gebäude
Zeitrennen-Modus
Meistere 30 Gebäude aus derselben Farbfamilie. Halte eine Übereinstimmung von mindestens 90 % für 0,5 Sekunden. Ab Gebäude 15 passt du auch die Helligkeit an. Das nächste Gebäude erscheint sofort. Pausen zählen nicht zur Zeit.
Starten
Wird vorbereitet …
Erneut verbinden
Diese Runde ohne Rangliste spielen
Keine Verbindung zur Rangliste möglich.
Der Rekord konnte nicht auf diesem Gerät gespeichert werden.
Ohne Speichern spielen
Gespeicherte Ergebnisse werden gesendet, sobald du wieder verbunden bist.
Gebäude {count} / 30
Zeit {time}
Halten {time}
Farbübereinstimmung {match}
Helligkeitsübereinstimmung {match}
Zielfarbe
Deine Farbe
Unterwegs zum nächsten Gebäude
Pausiert
Fortsetzen
Runde beenden
Rottöne
Grüntöne
Blautöne
Deine Zeit für 30 Gebäude
30 Gebäude geschafft
Runde vorzeitig beendet · {count} / 30 Gebäude geschafft
Gerätebestzeit {time}
Neue persönliche Bestzeit!
Noch einmal
Startseite
Zeit bestätigt. Die Rangliste zeigt deine persönliche Bestzeit.
Diese Runde erhält keinen Rang.
Dieses Ergebnis konnte nicht in die Rangliste aufgenommen werden.
Der Eingabeverlauf ist zu groß für die Rangliste.
Zeit: {time}
In einem anderen Tab läuft ein Zeitrennen.
Gebäude
Zeit
Farbfamilie
Farbübereinstimmung
Helligkeitsübereinstimmung
Haltezeit
Pausieren
`,
  ko: `
같은 색 계열 모드
타임 어택 · 건물 30채
타임 어택 모드
같은 색 계열의 건물 30채에 도전하세요. 일치도 90% 이상을 0.5초 동안 유지하세요. 15번째 건물부터는 밝기도 맞춰야 합니다. 조건을 충족하면 즉시 다음 건물로 넘어갑니다. 일시 정지 시간은 기록에 포함되지 않습니다.
시작
준비 중…
다시 연결하기
이번에는 순위에 올리지 않고 시작하기
순위표에 연결할 수 없습니다.
이 기기에 기록을 저장할 수 없습니다.
저장하지 않고 플레이하기
연결이 복구되면 저장된 기록을 보냅니다.
건물 {count} / 30
시간 {time}
유지 {time}
색상 일치도 {match}
밝기 일치도 {match}
목표 색상
내 색상
다음 건물로 이동 중
일시 정지
계속하기
도전 끝내기
빨간색 계열
초록색 계열
파란색 계열
이번 건물 30채 완주 시간
건물 30채 완주
중도 종료 · 건물 {count} / 30채 통과
이 기기의 최고 기록 {time}
새 개인 최고 기록!
다시 플레이
홈
기록을 확인했습니다. 순위표에는 개인 최고 기록이 표시됩니다.
이번 기록에는 순위가 매겨지지 않습니다.
이 결과를 순위표에 등록할 수 없습니다.
조작 기록이 너무 커서 순위표에 보낼 수 없습니다.
기록: {time}
다른 탭에서 타임 어택이 진행 중입니다.
건물
시간
색 계열
색상 일치도
밝기 일치도
유지 시간
일시 정지
`,
  ru: `
Режим одной гаммы
На время · 30 зданий
Режим на время
Пройдите 30 зданий одной цветовой гаммы. Удерживайте совпадение не ниже 90 % в течение 0,5 секунды. С 15-го здания подбирайте и яркость. Следующее здание появляется сразу. Паузы не учитываются.
Начать
Подготовка…
Подключиться снова
Сыграть без участия в рейтинге
Не удалось подключиться к рейтингу.
Не удалось сохранить результат на этом устройстве.
Играть без сохранения
Сохранённые результаты отправятся, когда соединение восстановится.
Здание {count} / 30
Время {time}
Удержание {time}
Совпадение цвета {match}
Совпадение яркости {match}
Целевой цвет
Ваш цвет
Переход к следующему зданию
Пауза
Продолжить
Завершить попытку
Красная гамма
Зелёная гамма
Синяя гамма
Ваше время за 30 зданий
Пройдено 30 зданий
Попытка завершена досрочно · пройдено {count} / 30 зданий
Лучшее время на устройстве {time}
Новый личный рекорд!
Сыграть ещё раз
Главная
Результат подтверждён. В рейтинге отображается ваш личный рекорд.
Эта попытка не получает места в рейтинге.
Не удалось внести результат в рейтинг.
История действий слишком велика для отправки в рейтинг.
Время: {time}
В другой вкладке уже идёт игра на время.
Здание
Время
Цветовая гамма
Совпадение цвета
Совпадение яркости
Время удержания
Пауза
`,
  it: `
Modalità a gamma unica
Contro il tempo · 30 edifici
Modalità contro il tempo
Affronta 30 edifici della stessa gamma di colori. Mantieni una corrispondenza di almeno il 90% per 0,5 secondi. Dal 15º edificio, abbina anche la luminosità. L’edificio successivo appare subito. Le pause restano fuori dal cronometro.
Inizia
Preparazione…
Riprova a connetterti
Gioca questa partita fuori classifica
Impossibile collegarsi alla classifica.
Impossibile salvare il tempo su questo dispositivo.
Gioca senza salvare
I tempi salvati saranno inviati al ripristino della connessione.
Edificio {count} / 30
Tempo {time}
Tieni {time}
Corrispondenza colore {match}
Corrispondenza luminosità {match}
Colore bersaglio
Il tuo colore
Verso il prossimo edificio
In pausa
Riprendi
Termina la partita
Tonalità di rosso
Tonalità di verde
Tonalità di blu
Il tuo tempo sui 30 edifici
30 edifici completati
Partita interrotta · {count} / 30 edifici completati
Miglior tempo sul dispositivo {time}
Nuovo record personale!
Gioca di nuovo
Home
Tempo verificato. La classifica mostra il tuo record personale.
Questa partita non ottiene una posizione.
Non è stato possibile inserire il risultato in classifica.
La cronologia delle azioni è troppo grande per essere inviata alla classifica.
Tempo: {time}
È in corso una partita contro il tempo in un’altra scheda.
Edificio
Tempo
Gamma di colori
Corrispondenza colore
Corrispondenza luminosità
Durata del mantenimento
Metti in pausa
`,
  'zh-Hant': `
同色系模式
計時挑戰 · 30 棟
計時挑戰模式
挑戰同一色系的 30 棟建築。相符度達到 90% 後維持 0.5 秒。從第 15 棟起也要配合亮度。達標後立即切換至下一棟建築。暫停時間不計入成績。
開始
準備中…
重新連線
本局不列入排名
無法連線至排行榜。
無法將紀錄儲存到這台裝置。
不儲存，繼續玩
連線恢復後會送出已儲存的紀錄。
第 {count} / 30 棟
用時 {time}
維持 {time}
顏色相符度 {match}
亮度相符度 {match}
目標顏色
目前顏色
正在前往下一棟
已暫停
繼續
結束本局
紅色系
綠色系
藍色系
本次 30 棟通關用時
已完成 30 棟
提早結束 · 已完成 {count} / 30 棟
本機最佳 {time}
刷新個人最佳！
再玩一次
首頁
成績已確認。排行榜顯示你的個人最佳成績。
本局沒有排名。
這筆成績未能登上排行榜。
操作紀錄過大，無法送出至排行榜。
成績：{time}
計時挑戰正在另一個分頁中進行。
建築
用時
色系
顏色相符度
亮度相符度
維持時間
暫停
`,
  id: `
Mode satu rumpun warna
Kejar waktu · 30 gedung
Mode kejar waktu
Taklukkan 30 gedung dalam satu rumpun warna. Pertahankan kecocokan minimal 90% selama 0,5 detik. Mulai gedung ke-15, cocokkan juga kecerahannya. Gedung berikutnya langsung muncul. Jeda tidak dihitung.
Mulai
Bersiap…
Coba sambungkan lagi
Mainkan percobaan ini tanpa peringkat
Tidak dapat terhubung ke papan peringkat.
Rekor tidak dapat disimpan di perangkat ini.
Main tanpa menyimpan
Rekor tersimpan akan dikirim saat koneksi pulih.
Gedung {count} / 30
Waktu {time}
Tahan {time}
Kecocokan warna {match}
Kecocokan kecerahan {match}
Warna target
Warnamu
Berpindah ke gedung berikutnya
Dijeda
Lanjutkan
Akhiri percobaan
Nuansa merah
Nuansa hijau
Nuansa biru
Waktumu untuk 30 gedung
30 gedung selesai
Berhenti lebih awal · {count} / 30 gedung selesai
Rekor terbaik perangkat {time}
Rekor pribadi baru!
Main lagi
Beranda
Rekor telah diverifikasi. Papan peringkat menampilkan rekor pribadimu.
Percobaan ini tidak mendapat peringkat.
Hasil ini tidak dapat masuk ke papan peringkat.
Riwayat aksi terlalu besar untuk dikirim ke papan peringkat.
Waktu: {time}
Mode kejar waktu sedang berjalan di tab lain.
Gedung
Waktu
Rumpun warna
Kecocokan warna
Kecocokan kecerahan
Durasi tahan
Jeda
`,
  tr: `
Tek renk ailesi modu
Zamana karşı · 30 bina
Zamana karşı modu
Aynı renk ailesinden 30 binayı geç. En az %90 eşleşmeyi 0,5 saniye boyunca koru. 15. binadan itibaren parlaklığı da eşleştir. Sonraki bina hemen görünür. Duraklamalar süreye katılmaz.
Başla
Hazırlanıyor…
Yeniden bağlan
Bu oyunu sıralama dışında oyna
Sıralama tablosuna bağlanılamadı.
Derece bu cihaza kaydedilemedi.
Kaydetmeden oyna
Bağlantı geri geldiğinde kayıtlı dereceler gönderilecek.
Bina {count} / 30
Süre {time}
Koruma {time}
Renk eşleşmesi {match}
Parlaklık eşleşmesi {match}
Hedef renk
Senin rengin
Sonraki binaya geçiliyor
Duraklatıldı
Devam et
Oyunu bitir
Kırmızı tonları
Yeşil tonları
Mavi tonları
30 bina için bitirme süren
30 bina tamamlandı
Erken bitirildi · {count} / 30 bina tamamlandı
Bu cihazdaki en iyi süre {time}
Yeni kişisel rekor!
Tekrar oyna
Ana sayfa
Derece doğrulandı. Sıralama tablosu kişisel en iyi süreni gösterir.
Bu oyun sıralamaya girmedi.
Bu sonuç sıralamaya alınamadı.
İşlem geçmişi sıralamaya gönderilemeyecek kadar büyük.
Süre: {time}
Başka bir sekmede zamana karşı oyun sürüyor.
Bina
Süre
Renk ailesi
Renk eşleşmesi
Parlaklık eşleşmesi
Koruma süresi
Duraklat
`,
  vi: `
Chế độ cùng tông màu
Đua thời gian · 30 tòa nhà
Chế độ đua thời gian
Thử sức với 30 tòa nhà cùng một tông màu. Giữ độ khớp từ 90% trong 0,5 giây. Từ tòa nhà thứ 15, hãy khớp cả độ sáng. Tòa nhà tiếp theo xuất hiện ngay. Thời gian tạm dừng không được tính.
Bắt đầu
Đang chuẩn bị…
Thử kết nối lại
Chơi lượt này ngoài bảng xếp hạng
Không thể kết nối với bảng xếp hạng.
Không thể lưu thành tích trên thiết bị này.
Chơi mà không lưu
Thành tích đã lưu sẽ được gửi khi có kết nối trở lại.
Tòa nhà {count} / 30
Thời gian {time}
Duy trì {time}
Độ khớp màu {match}
Độ khớp độ sáng {match}
Màu mục tiêu
Màu của bạn
Đang sang tòa nhà tiếp theo
Đã tạm dừng
Tiếp tục
Kết thúc lượt chơi
Tông đỏ
Tông xanh lá
Tông xanh dương
Thời gian vượt qua 30 tòa nhà
Đã vượt qua 30 tòa nhà
Dừng sớm · đã vượt {count} / 30 tòa nhà
Thành tích tốt nhất trên thiết bị {time}
Kỷ lục cá nhân mới!
Chơi lại
Trang chủ
Đã xác minh thành tích. Bảng xếp hạng hiển thị kỷ lục cá nhân của bạn.
Lượt này không có thứ hạng.
Không thể đưa kết quả này lên bảng xếp hạng.
Lịch sử thao tác quá lớn để gửi lên bảng xếp hạng.
Thành tích: {time}
Đang có lượt đua thời gian ở một thẻ khác.
Tòa nhà
Thời gian
Tông màu
Độ khớp màu
Độ khớp độ sáng
Thời gian duy trì
Tạm dừng
`,
  th: `
โหมดสีโทนเดียวกัน
แข่งกับเวลา · 30 อาคาร
โหมดแข่งกับเวลา
ผ่านอาคาร 30 หลังในกลุ่มสีเดียวกัน รักษาความตรงกันอย่างน้อย 90% ไว้ 0.5 วินาที ตั้งแต่อาคารหลังที่ 15 ต้องปรับความสว่างให้ตรงกันด้วย เมื่อผ่านเงื่อนไข อาคารถัดไปจะปรากฏทันที ช่วงหยุดพักไม่ถูกนับเวลา
เริ่ม
กำลังเตรียม…
ลองเชื่อมต่ออีกครั้ง
เล่นรอบนี้โดยไม่ลงอันดับ
เชื่อมต่อกับตารางอันดับไม่ได้
บันทึกสถิติลงในอุปกรณ์นี้ไม่ได้
เล่นโดยไม่บันทึก
ระบบจะส่งสถิติที่บันทึกไว้เมื่อเชื่อมต่อได้อีกครั้ง
อาคาร {count} / 30
เวลา {time}
รักษาไว้ {time}
ความตรงกันของสี {match}
ความตรงกันของความสว่าง {match}
สีเป้าหมาย
สีของคุณ
กำลังไปยังอาคารถัดไป
หยุดชั่วคราว
เล่นต่อ
จบรอบนี้
โทนสีแดง
โทนสีเขียว
โทนสีน้ำเงิน
เวลาที่ใช้ผ่านอาคาร 30 หลัง
ผ่านอาคารครบ 30 หลัง
จบก่อนกำหนด · ผ่าน {count} / 30 อาคาร
เวลาที่ดีที่สุดบนอุปกรณ์ {time}
สถิติส่วนตัวใหม่!
เล่นอีกครั้ง
หน้าหลัก
ตรวจสอบสถิติแล้ว ตารางอันดับจะแสดงสถิติที่ดีที่สุดของคุณ
รอบนี้ไม่ได้รับการจัดอันดับ
นำผลนี้เข้าตารางอันดับไม่ได้
ประวัติการเล่นมีขนาดใหญ่เกินกว่าจะส่งเข้าตารางอันดับ
สถิติ: {time}
กำลังเล่นโหมดแข่งกับเวลาในแท็บอื่น
อาคาร
เวลา
กลุ่มสี
ความตรงกันของสี
ความตรงกันของความสว่าง
เวลาที่รักษาไว้
หยุดชั่วคราว
`,
};

export const TIME_ATTACK_MESSAGES = Object.freeze(Object.fromEntries(
  Object.entries(localized).map(([lang, text]) => {
    const values = text.trim().split('\n');
    if (values.length !== keys.length) throw new Error(`Wrong Time Attack message count for ${lang}`);
    return [lang, Object.freeze(Object.fromEntries(keys.map((key, index) => [`ta.${key}`, values[index]])))];
  }),
));
