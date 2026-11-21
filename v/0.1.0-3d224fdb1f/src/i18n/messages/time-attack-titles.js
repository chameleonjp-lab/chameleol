// Titles are listed in order from the fastest tier. Keep the same order in every language.
const titleNames = {
  ja: `
神速のカメレオン|閃光の怪盗|一瞬の怪盗|疾風の怪盗|幻の擬態師|無音の怪盗|月下の怪盗|屋根の怪盗
擬態の名人|変色の名人|色合わせの名人|明暗の名人|濃淡の名人|影渡りの達人|屋根渡りの達人|路地抜けの達人
宝石の目利き|宝石の隠し役|宝石の運び手|金庫の鍵番|色合わせ職人|明暗合わせ職人|色見本の職人|壁色の職人
石畳の職人|看板色の職人|屋根色の職人|窓辺の見張り|路地の見張り|街角の見張り|夜道の案内役|屋根の案内役
路地の案内役|街角の案内役|夜道の調べ役|路地の調べ役|壁色の調べ役|窓明かりの観察役|街灯の観察役|月影の観察役
壁色の見習い|看板色の見習い|屋根歩きの見習い|路地歩きの見習い|擬態の練習生|明暗の練習生|変色の練習生|色探しの練習生
屋根の探検家|路地の探検家|街角の探検家|石畳の歩き手|屋根下の歩き手|路地の歩き手|月夜の散歩者|街灯の散歩者
街角の散歩者|街めぐりカメレオン
`,
  en: `
Lightning Chameleon|Flash Thief|Blink Thief|Gale Thief|Phantom Mimic|Silent Thief|Moonlit Thief|Rooftop Thief
Master of Disguise|Master of Color Change|Master Color Matcher|Master of Light and Shade|Master of Tones|Shadow Crossing Expert|Rooftop Crossing Expert|Alley Escape Expert
Gem Appraiser|Gem Hider|Gem Courier|Keeper of the Safe Key|Color Matching Artisan|Light and Shade Artisan|Color Swatch Artisan|Wall Color Artisan
Cobblestone Artisan|Sign Color Artisan|Roof Color Artisan|Window Watcher|Alley Lookout|Street Corner Lookout|Night Route Guide|Rooftop Guide
Alley Guide|Street Corner Guide|Night Route Scout|Alley Scout|Wall Color Scout|Window Light Observer|Street Lamp Observer|Moonshadow Observer
Wall Color Apprentice|Sign Color Apprentice|Rooftop Walking Apprentice|Alley Walking Apprentice|Disguise Trainee|Light and Shade Trainee|Color Change Trainee|Color Hunting Trainee
Rooftop Explorer|Alley Explorer|Street Corner Explorer|Cobblestone Walker|Eaves Walker|Alley Walker|Moonlight Stroller|Lamplight Stroller
Street Corner Stroller|City Roaming Chameleon
`,
  es: `
Camaleón relámpago|Ladrón destello|Ladrón fugaz|Ladrón del vendaval|Mimo fantasma|Ladrón silencioso|Ladrón a la luz de la luna|Ladrón de los tejados
Maestro del camuflaje|Maestro del cambio de color|Maestro de la igualación de colores|Maestro de luces y sombras|Maestro de los tonos|Experto en cruzar sombras|Experto en cruzar tejados|Experto en escapar por callejones
Tasador de gemas|Escondedor de gemas|Mensajero de gemas|Guardián de la llave de la caja fuerte|Artesano de la igualación de colores|Artesano de luces y sombras|Artesano de muestras de color|Artesano del color de los muros
Artesano del empedrado|Artesano del color de los letreros|Artesano del color de los tejados|Vigía de la ventana|Vigía del callejón|Vigía de la esquina|Guía de rutas nocturnas|Guía de los tejados
Guía de los callejones|Guía de las esquinas|Explorador de rutas nocturnas|Explorador de callejones|Explorador del color de los muros|Observador de ventanas iluminadas|Observador de farolas|Observador de sombras lunares
Aprendiz del color de los muros|Aprendiz del color de los letreros|Aprendiz de caminante de tejados|Aprendiz de caminante de callejones|Estudiante de camuflaje|Estudiante de luces y sombras|Estudiante de cambio de color|Estudiante de búsqueda de colores
Aventurero de los tejados|Aventurero de los callejones|Aventurero de las esquinas|Caminante del empedrado|Caminante bajo los aleros|Caminante de los callejones|Paseante a la luz de la luna|Paseante bajo las farolas
Paseante de las esquinas|Camaleón callejero
`,
  'pt-BR': `
Camaleão relâmpago|Ladrão do clarão|Ladrão fugaz|Ladrão da ventania|Mímico fantasma|Ladrão silencioso|Ladrão ao luar|Ladrão dos telhados
Mestre da camuflagem|Mestre da mudança de cor|Mestre da combinação de cores|Mestre de luz e sombra|Mestre dos tons|Especialista em atravessar sombras|Especialista em cruzar telhados|Especialista em fugir por becos
Avaliador de joias|Escondedor de joias|Mensageiro de joias|Guardião da chave do cofre|Artesão da combinação de cores|Artesão de luz e sombra|Artesão de amostras de cor|Artesão das cores das paredes
Artesão das pedras da rua|Artesão das cores das placas|Artesão das cores dos telhados|Vigia da janela|Vigia do beco|Vigia da esquina|Guia dos caminhos noturnos|Guia dos telhados
Guia dos becos|Guia das esquinas|Batedor noturno|Batedor dos becos|Batedor das cores das paredes|Observador de janelas iluminadas|Observador dos postes de luz|Observador das sombras da lua
Aprendiz das cores das paredes|Aprendiz das cores das placas|Aprendiz de andar pelos telhados|Aprendiz de andar pelos becos|Estudante de camuflagem|Estudante de luz e sombra|Estudante de mudança de cor|Estudante de busca por cores
Explorador dos telhados|Explorador dos becos|Explorador das esquinas|Andarilho das ruas de pedra|Andarilho sob os beirais|Andarilho dos becos|Passeante ao luar|Passeante sob os postes de luz
Passeante das esquinas|Camaleão que passeia pela cidade
`,
  'zh-Hans': `
神速变色龙|闪光怪盗|瞬影怪盗|疾风怪盗|幻影拟态师|无声怪盗|月下怪盗|屋顶怪盗
拟态宗师|变色宗师|配色宗师|明暗宗师|浓淡宗师|穿影达人|翻越屋顶达人|穿巷达人
宝石鉴定师|宝石藏匿员|宝石运送员|保险柜钥匙看守|配色工匠|明暗工匠|色卡工匠|墙色工匠
石板路工匠|招牌配色工匠|屋顶配色工匠|窗边哨兵|小巷哨兵|街角哨兵|夜路向导|屋顶向导
小巷向导|街角向导|夜路调查员|小巷调查员|墙色调查员|窗灯观察员|路灯观察员|月影观察员
墙色学徒|招牌配色学徒|屋顶行走学徒|小巷行走学徒|拟态练习生|明暗练习生|变色练习生|寻色练习生
屋顶探险家|小巷探险家|街角探险家|石板路行者|屋檐下行者|小巷行者|月夜漫步者|路灯下漫步者
街角漫步者|城市漫游变色龙
`,
  fr: `
Caméléon foudroyant|Voleur éclair|Voleur insaisissable|Voleur des rafales|Mime fantôme|Voleur silencieux|Voleur au clair de lune|Voleur des toits
Maître du camouflage|Maître du changement de couleur|Maître de l’accord des couleurs|Maître du clair-obscur|Maître des nuances|Expert des passages dans l’ombre|Expert des traversées sur les toits|Expert des échappées par les ruelles
Expert en gemmes|Cacheur de gemmes|Coursier de gemmes|Gardien de la clé du coffre|Artisan de l’accord des couleurs|Artisan du clair-obscur|Artisan des nuanciers|Artisan des couleurs murales
Artisan des pavés|Artisan des couleurs d’enseignes|Artisan des couleurs des toits|Guetteur à la fenêtre|Guetteur des ruelles|Guetteur du coin de rue|Guide des chemins de nuit|Guide des toits
Guide des ruelles|Guide des coins de rue|Éclaireur des chemins de nuit|Éclaireur des ruelles|Éclaireur des couleurs murales|Observateur des fenêtres éclairées|Observateur des lampadaires|Observateur des ombres lunaires
Apprenti des couleurs murales|Apprenti des couleurs d’enseignes|Apprenti marcheur sur les toits|Apprenti marcheur dans les ruelles|Élève du camouflage|Élève du clair-obscur|Élève du changement de couleur|Élève de la chasse aux couleurs
Explorateur des toits|Explorateur des ruelles|Explorateur des coins de rue|Marcheur des rues pavées|Marcheur sous les auvents|Marcheur des ruelles|Promeneur au clair de lune|Promeneur sous les lampadaires
Promeneur des coins de rue|Caméléon qui arpente la ville
`,
  de: `
Blitzchamäleon|Blitzdieb|Flüchtiger Dieb|Sturmdieb|Phantomtarnkünstler|Lautloser Dieb|Mondscheindieb|Dachdieb
Meister der Tarnung|Meister des Farbwechsels|Meister des Farbabgleichs|Meister von Licht und Schatten|Meister der Farbtöne|Schattengänger|Meister der Dachübergänge|Meister der Gassenflucht
Edelsteingutachter|Edelsteinverstecker|Edelsteinkurier|Wächter des Tresorschlüssels|Handwerker des Farbabgleichs|Handwerker für Licht und Schatten|Handwerker der Farbmuster|Wandfarbenhandwerker
Pflasterhandwerker|Handwerker für Schildfarben|Handwerker für Dachfarben|Fensterwache|Gassenwache|Wache an der Straßenecke|Wegweiser durch die Nacht|Dachwegweiser
Gassenwegweiser|Wegweiser an der Straßenecke|Nachtkundschafter|Gassenkundschafter|Erkunder der Wandfarben|Beobachter der Fensterlichter|Beobachter der Straßenlaternen|Beobachter der Mondschatten
Wandfarbenlehrling|Lehrling der Schildfarben|Dachläufer in Ausbildung|Gassenläufer in Ausbildung|Tarnschüler|Schüler für Licht und Schatten|Farbwechselschüler|Farbsucher in Ausbildung
Dachentdecker|Gassenentdecker|Entdecker der Straßenecken|Pflasterwanderer|Wanderer unter Dachrinnen|Gassenwanderer|Spaziergänger im Mondlicht|Spaziergänger im Laternenlicht
Spaziergänger an Straßenecken|Stadtwanderndes Chamäleon
`,
  ko: `
신속의 카멜레온|섬광의 괴도|순간의 괴도|질풍의 괴도|환영의 의태사|소리 없는 괴도|달빛 아래 괴도|지붕 위 괴도
의태의 명인|변색의 명인|색 맞추기 명인|명암의 명인|농담의 명인|그림자 건너기의 달인|지붕 건너기의 달인|골목 빠져나가기 달인
보석 감정사|보석 은닉 담당|보석 운반꾼|금고 열쇠지기|색 맞추기 장인|명암 맞추기 장인|색 견본 장인|벽 색깔 장인
돌길 장인|간판 색깔 장인|지붕 색깔 장인|창가 파수꾼|골목 파수꾼|길모퉁이 파수꾼|밤길 안내자|지붕길 안내자
골목 안내자|길모퉁이 안내자|밤길 조사원|골목 조사원|벽 색깔 조사원|창문 불빛 관찰자|가로등 관찰자|달그림자 관찰자
벽 색깔 견습생|간판 색깔 견습생|지붕 걷기 견습생|골목 걷기 견습생|의태 연습생|명암 연습생|변색 연습생|색 찾기 연습생
지붕 탐험가|골목 탐험가|길모퉁이 탐험가|돌길을 걷는 이|처마 밑을 걷는 이|골목을 걷는 이|달밤의 산책자|가로등 아래 산책자
길모퉁이 산책자|도시를 누비는 카멜레온
`,
  ru: `
Хамелеон-молния|Вор-вспышка|Неуловимый вор|Вор-ураган|Призрак маскировки|Бесшумный вор|Вор под луной|Крышный вор
Мастер маскировки|Мастер смены цвета|Мастер подбора цвета|Мастер света и тени|Мастер оттенков|Знаток переходов через тени|Знаток переходов по крышам|Знаток побегов через переулки
Оценщик самоцветов|Хранитель тайников с самоцветами|Курьер самоцветов|Хранитель ключа от сейфа|Умелец по подбору цвета|Умелец света и тени|Умелец цветовых образцов|Умелец по цветам стен
Умелец мостовой|Умелец по цветам вывесок|Умелец по цветам крыш|Часовой у окна|Часовой в переулке|Часовой на углу|Проводник по ночным улицам|Проводник по крышам
Проводник по переулкам|Проводник по городским углам|Разведчик ночных улиц|Разведчик переулков|Разведчик цветов стен|Наблюдатель за светом в окнах|Наблюдатель за фонарями|Наблюдатель за лунными тенями
Подмастерье по цветам стен|Подмастерье по цветам вывесок|Ученик крышного ходока|Ученик переулочного ходока|Ученик маскировки|Ученик света и тени|Ученик смены цвета|Ученик поиска цветов
Исследователь крыш|Исследователь переулков|Исследователь городских углов|Ходок по мостовой|Ходок под карнизами|Ходок по переулкам|Гуляющий под луной|Гуляющий под фонарями
Гуляющий по городским углам|Хамелеон на прогулке по городу
`,
  it: `
Camaleonte fulmineo|Ladro lampo|Ladro fugace|Ladro della burrasca|Mimo fantasma|Ladro silenzioso|Ladro al chiaro di luna|Ladro dei tetti
Maestro del mimetismo|Maestro del cambio di colore|Maestro dell’abbinamento dei colori|Maestro del chiaroscuro|Maestro delle sfumature|Esperto di passaggi nell’ombra|Esperto di attraversamenti sui tetti|Esperto di fughe nei vicoli
Stimatore di gemme|Custode dei nascondigli delle gemme|Corriere di gemme|Custode della chiave della cassaforte|Artigiano dell’abbinamento dei colori|Artigiano del chiaroscuro|Artigiano dei campioni di colore|Artigiano dei colori delle pareti
Artigiano del selciato|Artigiano dei colori delle insegne|Artigiano dei colori dei tetti|Vedetta alla finestra|Vedetta del vicolo|Vedetta all’angolo|Guida dei percorsi notturni|Guida dei tetti
Guida dei vicoli|Guida degli angoli di strada|Ricognitore dei percorsi notturni|Ricognitore dei vicoli|Ricognitore dei colori delle pareti|Osservatore delle finestre illuminate|Osservatore dei lampioni|Osservatore delle ombre lunari
Apprendista dei colori delle pareti|Apprendista dei colori delle insegne|Apprendista camminatore sui tetti|Apprendista camminatore nei vicoli|Allievo del mimetismo|Allievo del chiaroscuro|Allievo del cambio di colore|Allievo della ricerca dei colori
Esploratore dei tetti|Esploratore dei vicoli|Esploratore degli angoli di strada|Camminatore sul selciato|Camminatore sotto le gronde|Camminatore dei vicoli|Passeggiatore al chiaro di luna|Passeggiatore sotto i lampioni
Passeggiatore degli angoli di strada|Camaleonte a spasso per la città
`,
  'zh-Hant': `
神速變色龍|閃光怪盜|瞬影怪盜|疾風怪盜|幻影擬態師|無聲怪盜|月下怪盜|屋頂怪盜
擬態宗師|變色宗師|配色宗師|明暗宗師|濃淡宗師|穿影達人|翻越屋頂達人|穿巷達人
寶石鑑定師|寶石藏匿員|寶石運送員|保險箱鑰匙看守|配色工匠|明暗工匠|色票工匠|牆色工匠
石板路工匠|招牌配色工匠|屋頂配色工匠|窗邊哨兵|小巷哨兵|街角哨兵|夜路嚮導|屋頂嚮導
小巷嚮導|街角嚮導|夜路調查員|小巷調查員|牆色調查員|窗燈觀察員|路燈觀察員|月影觀察員
牆色學徒|招牌配色學徒|屋頂行走學徒|小巷行走學徒|擬態練習生|明暗練習生|變色練習生|尋色練習生
屋頂探險家|小巷探險家|街角探險家|石板路行者|屋簷下行者|小巷行者|月夜漫步者|路燈下漫步者
街角漫步者|城市漫遊變色龍
`,
  id: `
Bunglon Kilat|Pencuri Kilatan|Pencuri Sekejap|Pencuri Badai|Penyamar Hantu|Pencuri Senyap|Pencuri di Bawah Bulan|Pencuri Atap
Ahli Kamuflase|Ahli Perubahan Warna|Ahli Pencocokan Warna|Ahli Terang dan Bayang|Ahli Gradasi Warna|Jago Menyusuri Bayang|Jago Menyeberangi Atap|Jago Lolos Lewat Gang
Penaksir Permata|Penyembunyi Permata|Kurir Permata|Penjaga Kunci Brankas|Perajin Pencocokan Warna|Perajin Terang dan Bayang|Perajin Sampel Warna|Perajin Warna Dinding
Perajin Jalan Batu|Perajin Warna Papan Nama|Perajin Warna Atap|Pengawas Jendela|Pengawas Gang|Pengawas Sudut Jalan|Pemandu Jalan Malam|Pemandu Atap
Pemandu Gang|Pemandu Sudut Jalan|Pengintai Jalan Malam|Pengintai Gang|Pengintai Warna Dinding|Pengamat Cahaya Jendela|Pengamat Lampu Jalan|Pengamat Bayang Bulan
Murid Warna Dinding|Murid Warna Papan Nama|Murid Pejalan Atap|Murid Pejalan Gang|Pelajar Kamuflase|Pelajar Terang dan Bayang|Pelajar Perubahan Warna|Pelajar Pencari Warna
Penjelajah Atap|Penjelajah Gang|Penjelajah Sudut Jalan|Pejalan Jalan Batu|Pejalan di Bawah Tirisan|Pejalan Gang|Pengelana di Bawah Bulan|Pengelana di Bawah Lampu Jalan
Pengelana Sudut Jalan|Bunglon Penjelajah Kota
`,
  tr: `
Şimşek Bukalemun|Şimşek Hırsızı|Göz Açıp Kapayana Dek Kaçan Hırsız|Fırtına Hırsızı|Hayalet Taklitçi|Sessiz Hırsız|Ay Işığı Hırsızı|Çatı Hırsızı
Kamuflaj Ustası|Renk Değiştirme Ustası|Renk Eşleştirme Ustası|Işık ve Gölge Ustası|Renk Tonları Ustası|Gölgelerden Geçme Uzmanı|Çatılardan Geçme Uzmanı|Ara Sokaklardan Kaçış Uzmanı
Mücevher Değerleme Uzmanı|Mücevher Saklayıcısı|Mücevher Kuryesi|Kasa Anahtarı Bekçisi|Renk Eşleştirme Zanaatkârı|Işık ve Gölge Zanaatkârı|Renk Örneği Zanaatkârı|Duvar Rengi Zanaatkârı
Arnavut Kaldırımı Ustası|Tabela Rengi Zanaatkârı|Çatı Rengi Zanaatkârı|Pencere Gözcüsü|Ara Sokak Gözcüsü|Sokak Köşesi Gözcüsü|Gece Yolu Rehberi|Çatı Rehberi
Ara Sokak Rehberi|Sokak Köşesi Rehberi|Gece Yolu İzcisi|Ara Sokak İzcisi|Duvar Rengi İzcisi|Pencere Işığı Gözlemcisi|Sokak Lambası Gözlemcisi|Ay Gölgesi Gözlemcisi
Duvar Rengi Çırağı|Tabela Rengi Çırağı|Çatı Yürüyüşü Çırağı|Ara Sokak Yürüyüşü Çırağı|Kamuflaj Öğrencisi|Işık ve Gölge Öğrencisi|Renk Değiştirme Öğrencisi|Renk Arama Öğrencisi
Çatı Kâşifi|Ara Sokak Kâşifi|Sokak Köşesi Kâşifi|Taş Sokak Yürüyüşçüsü|Saçak Altı Yürüyüşçüsü|Ara Sokak Yürüyüşçüsü|Ay Işığı Gezgini|Sokak Lambaları Gezgini
Sokak Köşesi Gezgini|Şehri Gezen Bukalemun
`,
  vi: `
Tắc kè chớp nhoáng|Siêu trộm tia chớp|Siêu trộm thoắt ẩn thoắt hiện|Siêu trộm cuồng phong|Bậc thầy ngụy trang bóng ma|Siêu trộm không tiếng động|Siêu trộm dưới trăng|Siêu trộm mái nhà
Bậc thầy ngụy trang|Bậc thầy đổi màu|Bậc thầy khớp màu|Bậc thầy sáng tối|Bậc thầy sắc độ|Cao thủ vượt bóng|Cao thủ băng qua mái nhà|Cao thủ thoát qua hẻm
Chuyên gia giám định đá quý|Người giấu đá quý|Người chuyển đá quý|Người giữ chìa khóa két|Nghệ nhân khớp màu|Nghệ nhân cân sáng tối|Nghệ nhân mẫu màu|Nghệ nhân màu tường
Nghệ nhân đường đá|Nghệ nhân màu biển hiệu|Nghệ nhân màu mái nhà|Người gác bên cửa sổ|Người gác hẻm|Người gác góc phố|Người dẫn đường đêm|Người dẫn đường trên mái
Người dẫn đường qua hẻm|Người dẫn đường ở góc phố|Trinh sát đường đêm|Trinh sát hẻm|Trinh sát màu tường|Người quan sát ánh đèn cửa sổ|Người quan sát đèn đường|Người quan sát bóng trăng
Học việc màu tường|Học việc màu biển hiệu|Học việc đi trên mái|Học việc đi trong hẻm|Học viên ngụy trang|Học viên sáng tối|Học viên đổi màu|Học viên tìm màu
Nhà thám hiểm mái nhà|Nhà thám hiểm hẻm|Nhà thám hiểm góc phố|Người đi đường lát đá|Người đi dưới mái hiên|Người đi trong hẻm|Người dạo dưới trăng|Người dạo dưới đèn đường
Người dạo góc phố|Tắc kè dạo quanh thành phố
`,
  th: `
กิ้งก่าสายฟ้า|จอมโจรแสงวาบ|จอมโจรชั่วพริบตา|จอมโจรสายลมกรด|นักพรางตัวเงาลวง|จอมโจรไร้เสียง|จอมโจรใต้แสงจันทร์|จอมโจรบนหลังคา
ปรมาจารย์การพรางตัว|ปรมาจารย์การเปลี่ยนสี|ปรมาจารย์การเทียบสี|ปรมาจารย์แสงและเงา|ปรมาจารย์เฉดสี|ผู้เชี่ยวชาญการข้ามเงา|ผู้เชี่ยวชาญการข้ามหลังคา|ผู้เชี่ยวชาญการหลบหนีทางตรอก
นักประเมินอัญมณี|ผู้ซ่อนอัญมณี|ผู้ส่งอัญมณี|ผู้เฝ้ากุญแจตู้เซฟ|ช่างเทียบสี|ช่างปรับแสงและเงา|ช่างทำตัวอย่างสี|ช่างสีผนัง
ช่างปูถนนหิน|ช่างสีป้าย|ช่างสีหลังคา|ยามริมหน้าต่าง|ยามเฝ้าตรอก|ยามเฝ้ามุมถนน|คนนำทางยามค่ำคืน|คนนำทางบนหลังคา
คนนำทางในตรอก|คนนำทางที่มุมถนน|นักสำรวจทางยามค่ำคืน|นักสำรวจเส้นทางในตรอก|นักสำรวจสีผนัง|ผู้สังเกตแสงจากหน้าต่าง|ผู้สังเกตไฟถนน|ผู้สังเกตเงาจันทร์
เด็กฝึกสีผนัง|เด็กฝึกสีป้าย|เด็กฝึกเดินบนหลังคา|เด็กฝึกเดินในตรอก|นักเรียนพรางตัว|นักเรียนแสงและเงา|นักเรียนเปลี่ยนสี|นักเรียนค้นหาสี
นักผจญภัยบนหลังคา|นักผจญภัยในตรอก|นักผจญภัยที่มุมถนน|คนเดินถนนหิน|คนเดินใต้ชายคา|คนเดินในตรอก|นักเดินเล่นใต้แสงจันทร์|นักเดินเล่นใต้ไฟถนน
นักเดินเล่นตามมุมถนน|กิ้งก่าเดินเที่ยวเมือง
`,
};

export const TIME_ATTACK_TITLE_MESSAGES = Object.freeze(Object.fromEntries(
  Object.entries(titleNames).map(([lang, text]) => {
    const names = text.trim().split(/[|\n]/u);
    if (names.length !== 58 || new Set(names).size !== names.length) {
      throw new Error(`Expected 58 distinct Time Attack titles for ${lang}`);
    }
    const entries = names.map((name, index) => [`ta.title.${String(index + 1).padStart(2, '0')}`, name]);
    return [lang, Object.freeze(Object.fromEntries(entries))];
  }),
));
