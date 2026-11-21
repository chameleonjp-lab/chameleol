// Each localized row follows the same key order. Keep interpolated values intact.
const keys = [
  'home', 'homeNote', 'mode', 'instructions', 'start', 'preparing',
  'retry', 'localStart', 'startFailed', 'storageFailed',
  'continueWithoutSaving', 'offlineQueue',
  'building', 'time', 'hold', 'color', 'brightness', 'target', 'current',
  'travel', 'paused', 'resume', 'quit', 'family.red', 'family.green', 'family.blue',
  'clearTime', 'cleared', 'quitSummary', 'best', 'newBest', 'again', 'homeAction',
  'status.official', 'status.noRank', 'status.rejected', 'status.tooLarge', 'shareRecord',
  'activeElsewhere', 'buildingLabel', 'timeLabel', 'familyLabel', 'colorLabel', 'brightnessLabel', 'holdLabel', 'pause', 'trickyColors', 'status.archived',
];

const localized = {
  ja: `
タイムアタック
全色・20棟
タイムアタックモード
全色から出題される20棟に挑戦。最初の10棟は色だけ、11棟目からは明るさも合わせます。一致度が85%以上になると数値が消えます。90%以上を0.5秒保つと、次の建物にすぐ切り替わります。一時停止中は計時しません。
はじめる
準備中…
もう一度接続する
今回だけランキング対象外で始める
ランキングに接続できませんでした。
端末に記録を保存できませんでした。
保存せずに遊ぶ
接続が戻りしだい、保存した記録を送ります。
{count} / {total}棟
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
今回の{total}棟クリアタイム
{total}棟完走
途中終了・{count} / {total}棟クリア
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
苦手な色
このプレイの記録は端末で確認できます。
`,
  en: `
Time Attack
All colors · 20 buildings
Time Attack Mode
Match colors across 20 buildings using the full palette. Match brightness too from building 11. Each match percentage disappears at 85% or higher. Hold 90% or higher for 0.5 seconds to reveal the next building immediately. Pauses are off the clock.
Start
Getting ready…
Try connecting again
Play this run without ranking
Could not connect to the rankings.
Could not save the record to this device.
Play without saving
Saved records will be sent when you reconnect.
Building {count} / {total}
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
Your {total}-building clear time
{total} buildings cleared
Run ended early · {count} / {total} buildings cleared
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
Trickiest colors
You can view this run on this device.
`,
  es: `
Contrarreloj
Todos los colores · 20 edificios
Modo contrarreloj
Iguala los colores de 20 edificios de toda la paleta. Desde el edificio 11, iguala también el brillo. Cada porcentaje se oculta al llegar al 85 %. Mantén al menos un 90 % durante 0,5 segundos y aparecerá el siguiente edificio. Las pausas no cuentan.
Empezar
Preparando…
Volver a conectar
Jugar esta partida sin clasificación
No se pudo conectar con la clasificación.
No se pudo guardar la marca en este dispositivo.
Jugar sin guardar
Las marcas guardadas se enviarán al recuperar la conexión.
Edificio {count} / {total}
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
Tu tiempo en los {total} edificios
{total} edificios completados
Partida sin terminar · {count} / {total} edificios completados
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
Colores más difíciles
Puedes consultar esta partida en este dispositivo.
`,
  'pt-BR': `
Contra o relógio
Todas as cores · 20 prédios
Modo contra o relógio
Combine as cores de 20 prédios usando toda a paleta. A partir do 11º prédio, ajuste também o brilho. Cada porcentagem some ao atingir 85%. Mantenha pelo menos 90% por 0,5 segundo para ir ao próximo prédio imediatamente. As pausas não contam.
Começar
Preparando…
Tentar conectar de novo
Jogar esta partida sem classificação
Não foi possível conectar à classificação.
Não foi possível salvar o tempo neste dispositivo.
Jogar sem salvar
Os tempos salvos serão enviados quando a conexão voltar.
Prédio {count} / {total}
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
Seu tempo nos {total} prédios
{total} prédios concluídos
Partida encerrada · {count} / {total} prédios concluídos
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
Cores mais difíceis
Você pode consultar esta partida neste dispositivo.
`,
  'zh-Hans': `
限时竞速
全色 · 20 栋
限时竞速模式
使用完整色盘挑战 20 栋建筑。从第 11 栋起还要匹配亮度。每项匹配度达到 85% 时隐藏数值。保持 90% 或更高 0.5 秒即可立即切换至下一栋。暂停时间不计入成绩。
开始
准备中…
重新连接
本局不参与排名
无法连接排行榜。
无法将记录保存到此设备。
不保存，继续玩
连接恢复后会发送已保存的记录。
第 {count} / {total} 栋
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
本次 {total} 栋通关用时
已完成 {total} 栋
提前结束 · 已完成 {count} / {total} 栋
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
最难匹配的颜色
可以在此设备上查看这次记录。
`,
  fr: `
Contre-la-montre
Toutes les couleurs · 20 bâtiments
Mode contre-la-montre
Associez les couleurs de 20 bâtiments avec toute la palette. Ajustez aussi la luminosité dès le 11ᵉ bâtiment. Chaque pourcentage disparaît dès 85 %. Maintenez au moins 90 % pendant 0,5 seconde pour passer aussitôt au bâtiment suivant. Les pauses sont hors chrono.
Commencer
Préparation…
Retenter la connexion
Jouer cette partie hors classement
Impossible de se connecter au classement.
Impossible d’enregistrer le temps sur cet appareil.
Jouer sans enregistrer
Les temps enregistrés seront envoyés au retour de la connexion.
Bâtiment {count} / {total}
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
Votre temps sur les {total} bâtiments
{total} bâtiments franchis
Partie interrompue · {count} / {total} bâtiments franchis
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
Couleurs les plus difficiles
Vous pouvez consulter cette partie sur cet appareil.
`,
  de: `
Zeitrennen
Alle Farben · 20 Gebäude
Zeitrennen-Modus
Passe die Farben von 20 Gebäuden mit der ganzen Palette an. Ab Gebäude 11 zählt auch die Helligkeit. Jede Prozentanzeige verschwindet ab 85 %. Halte mindestens 90 % für 0,5 Sekunden, um sofort zum nächsten Gebäude zu wechseln. Pausen zählen nicht zur Zeit.
Starten
Wird vorbereitet …
Erneut verbinden
Diese Runde ohne Rangliste spielen
Keine Verbindung zur Rangliste möglich.
Der Rekord konnte nicht auf diesem Gerät gespeichert werden.
Ohne Speichern spielen
Gespeicherte Ergebnisse werden gesendet, sobald du wieder verbunden bist.
Gebäude {count} / {total}
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
Deine Zeit für {total} Gebäude
{total} Gebäude geschafft
Runde vorzeitig beendet · {count} / {total} Gebäude geschafft
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
Schwierigste Farben
Du kannst diesen Lauf auf diesem Gerät ansehen.
`,
  ko: `
타임 어택
모든 색상 · 건물 20채
타임 어택 모드
전체 색상 팔레트로 건물 20채에 도전하세요. 11번째 건물부터는 밝기도 맞추세요. 각 일치도는 85% 이상에서 숫자가 사라집니다. 90% 이상을 0.5초 동안 유지하면 즉시 다음 건물로 넘어갑니다. 일시 정지 시간은 기록에 포함되지 않습니다.
시작
준비 중…
다시 연결하기
이번에는 순위에 올리지 않고 시작하기
순위표에 연결할 수 없습니다.
이 기기에 기록을 저장할 수 없습니다.
저장하지 않고 플레이하기
연결이 복구되면 저장된 기록을 보냅니다.
건물 {count} / {total}
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
이번 건물 {total}채 완주 시간
건물 {total}채 완주
중도 종료 · 건물 {count} / {total}채 통과
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
어려웠던 색상
이 플레이 기록은 이 기기에서 확인할 수 있습니다.
`,
  ru: `
На время
Все цвета · 20 зданий
Режим на время
Подберите цвета 20 зданий по всей палитре. С 11-го здания подбирайте и яркость. Каждый процент совпадения скрывается при 85 % и выше. Удерживайте не менее 90 % в течение 0,5 секунды, чтобы сразу перейти к следующему зданию. Паузы не учитываются.
Начать
Подготовка…
Подключиться снова
Сыграть без участия в рейтинге
Не удалось подключиться к рейтингу.
Не удалось сохранить результат на этом устройстве.
Играть без сохранения
Сохранённые результаты отправятся, когда соединение восстановится.
Здание {count} / {total}
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
Ваше время за {total} зданий
Пройдено {total} зданий
Попытка завершена досрочно · пройдено {count} / {total} зданий
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
Самые сложные цвета
Эту попытку можно посмотреть на этом устройстве.
`,
  it: `
Contro il tempo
Tutti i colori · 20 edifici
Modalità contro il tempo
Abbina i colori di 20 edifici usando tutta la tavolozza. Dall’11º edificio abbina anche la luminosità. Ogni percentuale scompare dall’85% in su. Mantieni almeno il 90% per 0,5 secondi per passare subito all’edificio successivo. Le pause sono fuori dal cronometro.
Inizia
Preparazione…
Riprova a connetterti
Gioca questa partita fuori classifica
Impossibile collegarsi alla classifica.
Impossibile salvare il tempo su questo dispositivo.
Gioca senza salvare
I tempi salvati saranno inviati al ripristino della connessione.
Edificio {count} / {total}
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
Il tuo tempo sui {total} edifici
{total} edifici completati
Partita interrotta · {count} / {total} edifici completati
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
Colori più difficili
Puoi consultare questa partita su questo dispositivo.
`,
  'zh-Hant': `
計時挑戰
全色 · 20 棟
計時挑戰模式
使用完整色盤挑戰 20 棟建築。從第 11 棟起也要配合亮度。每項相符度達到 85% 時隱藏數值。維持 90% 或以上 0.5 秒即可立即切換至下一棟。暫停時間不計入成績。
開始
準備中…
重新連線
本局不列入排名
無法連線至排行榜。
無法將紀錄儲存到這台裝置。
不儲存，繼續玩
連線恢復後會送出已儲存的紀錄。
第 {count} / {total} 棟
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
本次 {total} 棟通關用時
已完成 {total} 棟
提早結束 · 已完成 {count} / {total} 棟
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
最難配對的顏色
可以在這部裝置上查看這次紀錄。
`,
  id: `
Kejar waktu
Semua warna · 20 gedung
Mode kejar waktu
Cocokkan warna 20 gedung dengan seluruh palet. Mulai gedung ke-11, cocokkan juga kecerahannya. Setiap persentase menghilang saat mencapai 85%. Pertahankan minimal 90% selama 0,5 detik untuk langsung pindah ke gedung berikutnya. Jeda tidak dihitung.
Mulai
Bersiap…
Coba sambungkan lagi
Mainkan percobaan ini tanpa peringkat
Tidak dapat terhubung ke papan peringkat.
Rekor tidak dapat disimpan di perangkat ini.
Main tanpa menyimpan
Rekor tersimpan akan dikirim saat koneksi pulih.
Gedung {count} / {total}
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
Waktumu untuk {total} gedung
{total} gedung selesai
Berhenti lebih awal · {count} / {total} gedung selesai
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
Warna tersulit
Kamu bisa melihat permainan ini di perangkat ini.
`,
  tr: `
Zamana karşı
Tüm renkler · 20 bina
Zamana karşı modu
Tüm paleti kullanarak 20 binanın rengini eşleştir. 11. binadan itibaren parlaklığı da ayarla. Her eşleşme yüzdesi %85 ve üstünde gizlenir. En az %90 eşleşmeyi 0,5 saniye koruyunca sonraki bina hemen görünür. Duraklamalar süreye katılmaz.
Başla
Hazırlanıyor…
Yeniden bağlan
Bu oyunu sıralama dışında oyna
Sıralama tablosuna bağlanılamadı.
Derece bu cihaza kaydedilemedi.
Kaydetmeden oyna
Bağlantı geri geldiğinde kayıtlı dereceler gönderilecek.
Bina {count} / {total}
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
{total} bina için bitirme süren
{total} bina tamamlandı
Erken bitirildi · {count} / {total} bina tamamlandı
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
En zor renkler
Bu koşuyu bu cihazda görebilirsin.
`,
  vi: `
Đua thời gian
Mọi màu sắc · 20 tòa nhà
Chế độ đua thời gian
Dùng toàn bộ bảng màu để khớp màu 20 tòa nhà. Từ tòa thứ 11, hãy khớp cả độ sáng. Mỗi tỷ lệ khớp sẽ ẩn từ 85% trở lên. Giữ ít nhất 90% trong 0,5 giây để chuyển ngay sang tòa nhà tiếp theo. Thời gian tạm dừng không được tính.
Bắt đầu
Đang chuẩn bị…
Thử kết nối lại
Chơi lượt này ngoài bảng xếp hạng
Không thể kết nối với bảng xếp hạng.
Không thể lưu thành tích trên thiết bị này.
Chơi mà không lưu
Thành tích đã lưu sẽ được gửi khi có kết nối trở lại.
Tòa nhà {count} / {total}
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
Thời gian vượt qua {total} tòa nhà
Đã vượt qua {total} tòa nhà
Dừng sớm · đã vượt {count} / {total} tòa nhà
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
Màu khó khớp nhất
Bạn có thể xem lượt chơi này trên thiết bị này.
`,
  th: `
แข่งกับเวลา
ทุกสี · 20 อาคาร
โหมดแข่งกับเวลา
ใช้จานสีทั้งหมดเพื่อจับคู่สีอาคาร 20 หลัง ตั้งแต่หลังที่ 11 ให้ปรับความสว่างด้วย เมื่อความตรงกันแต่ละค่าแตะ 85% ตัวเลขจะหายไป คงความตรงกันอย่างน้อย 90% ไว้ 0.5 วินาทีเพื่อไปอาคารถัดไปทันที เวลาที่หยุดพักจะไม่ถูกนับ
เริ่ม
กำลังเตรียม…
ลองเชื่อมต่ออีกครั้ง
เล่นรอบนี้โดยไม่ลงอันดับ
เชื่อมต่อกับตารางอันดับไม่ได้
บันทึกสถิติลงในอุปกรณ์นี้ไม่ได้
เล่นโดยไม่บันทึก
ระบบจะส่งสถิติที่บันทึกไว้เมื่อเชื่อมต่อได้อีกครั้ง
อาคาร {count} / {total}
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
เวลาที่ใช้ผ่านอาคาร {total} หลัง
ผ่านอาคารครบ {total} หลัง
จบก่อนกำหนด · ผ่าน {count} / {total} อาคาร
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
สีที่จับคู่ยากที่สุด
คุณดูผลรอบนี้ได้บนอุปกรณ์นี้
`,
};

export const TIME_ATTACK_MESSAGES = Object.freeze(Object.fromEntries(
  Object.entries(localized).map(([lang, text]) => {
    const values = text.trim().split('\n');
    if (values.length !== keys.length) throw new Error(`Wrong Time Attack message count for ${lang}`);
    return [lang, Object.freeze(Object.fromEntries(keys.map((key, index) => [`ta.${key}`, values[index]])))];
  }),
));
