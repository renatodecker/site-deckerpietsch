/* ============================================================
   STICKER ALBUM TRACKER – Copa do Mundo FIFA 2026
   Cloud-synced version with shared albums
   ============================================================ */

const API_BASE = 'https://genctdyga3.execute-api.sa-east-1.amazonaws.com';
const POS_LABELS = { GOL: 'Goleiro', ZAG: 'Zagueiro', MEI: 'Meia', ATA: 'Atacante' };
const POS_ORDER = ['GOL','GOL','ZAG','ZAG','ZAG','ZAG','ZAG','MEI','MEI','MEI','MEI','MEI','ATA','ATA','ATA','ATA'];
const SPECIAL_ICONS = { silver: '🥈', gold: '🥇', legend: '⭐', parallel: '🔷' };

/* ============================================================
   API HELPERS
   ============================================================ */
const api = {
  async create(name) {
    const r = await fetch(`${API_BASE}/api/albums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao criar álbum');
    return data;
  },
  async get(code) {
    const r = await fetch(`${API_BASE}/api/albums/${code}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Álbum não encontrado');
    return data;
  },
  async update(code, pin, body, keepalive = false) {
    const r = await fetch(`${API_BASE}/api/albums/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Album-Pin': pin },
      body: JSON.stringify(body),
      keepalive,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao salvar');
    return data;
  },
  async remove(code, pin) {
    const r = await fetch(`${API_BASE}/api/albums/${code}`, {
      method: 'DELETE',
      headers: { 'X-Album-Pin': pin },
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao excluir');
    return data;
  },
};

/* ============================================================
   LOCAL STORAGE – recent albums cache
   ============================================================ */
function getRecentAlbums() {
  try { return JSON.parse(localStorage.getItem('albumRecent') || '[]'); }
  catch { return []; }
}
function saveRecentAlbums(list) {
  localStorage.setItem('albumRecent', JSON.stringify(list));
}
function addRecentAlbum(code, pin, name) {
  const list = getRecentAlbums().filter(a => a.code !== code);
  list.unshift({ code, pin: pin || null, name });
  if (list.length > 20) list.pop();
  saveRecentAlbums(list);
}
function removeRecentAlbum(code) {
  saveRecentAlbums(getRecentAlbums().filter(a => a.code !== code));
}
function getStoredPin(code) {
  return getRecentAlbums().find(a => a.code === code)?.pin || null;
}

/* ============================================================
   COMPACT ENCODING (same as before)
   ============================================================ */
const SPECIAL_TO_CODE = { gold: 'g', silver: 's', legend: 'l', parallel: 'p' };
const CODE_TO_SPECIAL = { g: 'gold', s: 'silver', l: 'legend', p: 'parallel' };

function encodeAlbumData(st) {
  const collected = [], specials = [], dupes = [], pasted = [];
  for (const num in st) {
    if (!st[num]) continue;
    collected.push(num);
    if (st[num].s) specials.push(`${num}${SPECIAL_TO_CODE[st[num].s] || ''}`);
    if (st[num].d && st[num].d > 0) dupes.push(`${num}:${st[num].d}`);
    if (st[num].p) pasted.push(num);
  }
  return `${collected.join(',')}|${specials.join(',')}|${dupes.join(',')}|${pasted.join(',')}`;
}

function decodeAlbumData(raw) {
  if (!raw) return {};
  const parts = raw.split('|');
  const result = {};
  const collectedStr = parts[0] || '';
  const specialsStr = parts[1] || '';
  const dupesStr = parts[2] || '';
  const pastedStr = parts[3] || '';

  if (collectedStr) {
    collectedStr.split(',').forEach(n => {
      const num = n.trim();
      if (num) result[num] = { c: true };
    });
  }
  if (specialsStr) {
    specialsStr.split(',').forEach(entry => {
      if (!entry) return;
      const code = entry.slice(-1);
      const num = entry.slice(0, -1);
      if (result[num] && CODE_TO_SPECIAL[code]) result[num].s = CODE_TO_SPECIAL[code];
    });
  }
  if (dupesStr) {
    dupesStr.split(',').forEach(entry => {
      if (!entry) return;
      const [num, count] = entry.split(':');
      if (result[num]) result[num].d = parseInt(count) || 0;
    });
  }
  if (pastedStr) {
    pastedStr.split(',').forEach(n => {
      const num = n.trim();
      if (num && result[num]) result[num].p = true;
    });
  }
  return result;
}

/* ============================================================
   APP STATE
   ============================================================ */
let currentCode = null;
let currentPin = null;
let currentName = null;
let readOnly = true;
let state = {};

let saveTimer = null;
let savePending = false;

function saveState() {
  if (readOnly || !currentCode || !currentPin) return;
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushSave(false), 1500);
}

async function flushSave(keepalive = false) {
  if (!savePending || readOnly || !currentCode || !currentPin) return;
  savePending = false;
  try {
    await api.update(currentCode, currentPin, { data: encodeAlbumData(state) }, keepalive);
  } catch (e) {
    console.error('Erro ao salvar:', e);
    showToast('Erro ao salvar. Tente novamente.');
  }
}

/* ============================================================
   STICKER DATA
   ============================================================ */
const INTRO_STICKERS = [
  { num: 1, label: 'Logo FIFA', type: 'logo' },
  { num: 2, label: 'Troféu', type: 'logo' },
  { num: 3, label: 'Mascote 1', type: 'mascot' },
  { num: 4, label: 'Mascote 2', type: 'mascot' },
  { num: 5, label: 'Bola Oficial', type: 'logo' },
  { num: 6, label: 'Pôster Oficial', type: 'logo' },
  { num: 7, label: 'MetLife Stadium', type: 'stadium' },
  { num: 8, label: 'MetLife Stadium', type: 'stadium' },
  { num: 9, label: 'SoFi Stadium', type: 'stadium' },
  { num: 10, label: 'SoFi Stadium', type: 'stadium' },
  { num: 11, label: 'AT&T Stadium', type: 'stadium' },
  { num: 12, label: 'AT&T Stadium', type: 'stadium' },
  { num: 13, label: 'Hard Rock Stadium', type: 'stadium' },
  { num: 14, label: 'Hard Rock Stadium', type: 'stadium' },
  { num: 15, label: 'NRG Stadium', type: 'stadium' },
  { num: 16, label: 'NRG Stadium', type: 'stadium' },
  { num: 17, label: 'Lumen Field', type: 'stadium' },
  { num: 18, label: 'Lumen Field', type: 'stadium' },
  { num: 19, label: 'Lincoln Financial Field', type: 'stadium' },
  { num: 20, label: 'Lincoln Financial Field', type: 'stadium' },
  { num: 21, label: "Levi's Stadium", type: 'stadium' },
  { num: 22, label: "Levi's Stadium", type: 'stadium' },
  { num: 23, label: 'Mercedes-Benz Stadium', type: 'stadium' },
  { num: 24, label: 'Mercedes-Benz Stadium', type: 'stadium' },
  { num: 25, label: 'Arrowhead Stadium', type: 'stadium' },
  { num: 26, label: 'Arrowhead Stadium', type: 'stadium' },
  { num: 27, label: 'Estadio Azteca', type: 'stadium' },
  { num: 28, label: 'Estadio Azteca', type: 'stadium' },
  { num: 29, label: 'Estadio BBVA', type: 'stadium' },
  { num: 30, label: 'Estadio BBVA', type: 'stadium' },
  { num: 31, label: 'Estadio Akron', type: 'stadium' },
  { num: 32, label: 'Estadio Akron', type: 'stadium' },
  { num: 33, label: 'BMO Field', type: 'stadium' },
  { num: 34, label: 'BMO Field', type: 'stadium' },
  { num: 35, label: 'BC Place', type: 'stadium' },
  { num: 36, label: 'BC Place', type: 'stadium' },
];

const TEAMS_RAW = [
  ['MEX','México','🇲🇽','A',37,['G. Ochoa','L. Malagón','J. Sánchez','C. Montes','J. Vásquez','J. Gallardo','K. Álvarez','E. Álvarez','L. Chávez','O. Pineda','C. Rodríguez','D. Lainez','H. Lozano','S. Giménez','R. Jiménez','J. Quiñones'],'#0B5C36'],
  ['KOR','Coreia do Sul','🇰🇷','A',55,['Kim Seung-gyu','Jo Hyeon-woo','Kim Min-jae','Kim Young-gwon','Cho Yu-min','Lee Ki-je','Kim Jin-su','Son Heung-min','Hwang In-beom','Lee Jae-sung','Lee Kang-in','Jung Woo-young','Hwang Hee-chan','Cho Gue-sung','Oh Hyeon-gyu','Jang Yun-ho'],'#001F4D'],
  ['CZE','Tchéquia','🇨🇿','A',73,['J. Staněk','T. Vaclík','V. Coufal','R. Hranáč','T. Holeš','D. Zima','L. Krejčí','T. Souček','A. Král','L. Provod','M. Sadílek','A. Hložek','P. Schick','M. Chytil','J. Kuchta','T. Chorý'],'#11457E'],
  ['RSA','África do Sul','🇿🇦','A',91,['R. Williams','V. Mothwa','M. Mvala','R. Dortley','G. Kekana','A. Modiba','S. Xulu','T. Mokoena','T. Zwane','M. Saleng','L. Le Roux','B. Aubaas','P. Tau','E. Makgopa','I. Rayners','L. Mothiba'],'#007A4D'],
  ['CAN','Canadá','🇨🇦','B',109,['M. Crépeau','D. St. Clair','A. Davies','A. Johnston','K. Miller','D. Cornelius','S. Adekugbe','S. Eustáquio','I. Koné','J. Osorio','T. Buchanan','M.A. Kaye','J. David','C. Larin','L. Millar','J. Shaffelburg'],'#D52B1E'],
  ['BIH','Bósnia-Herz.','🇧🇦','B',127,['N. Vasilj','I. Šehić','S. Kolašinac','E. Bičakčić','D. Hadžikadunić','A. Hadžiahmetović','S. Lončar','M. Pjanić','A. Gigović','A. Gojak','H. Hajradinović','B. Tahirović','E. Džeko','E. Demirović','L. Menalo','S. Prevljak'],'#002B7F'],
  ['QAT','Catar','🇶🇦','B',145,['S. Al-Sheeb','M. Barsham','P. Miguel','B. Al-Rawi','T. Salman','B. Khoukhi','H. Ahmed','H. Al-Haydos','K. Boudiaf','A. Hatem','A. Madibo','A. Afif','A. Ali','M. Muntari','A. Alaaeldin','Y. Abdurisag'],'#8A1538'],
  ['SUI','Suíça','🇨🇭','B',163,['Y. Sommer','G. Kobel','M. Akanji','F. Schär','N. Elvedi','R. Rodríguez','S. Widmer','G. Xhaka','D. Zakaria','R. Freuler','X. Shaqiri','D. Sow','B. Embolo','N. Okafor','R. Vargas','Z. Amdouni'],'#B22222'],
  ['BRA','Brasil','🇧🇷','C',181,['Alisson','Ederson','Marquinhos','Militão','Bremer','Danilo','Wendell','Casemiro','Bruno Guimarães','L. Paquetá','Raphinha','Rodrygo','Vinícius Jr.','Endrick','Savinho','Estêvão'],'#0B4A2C'],
  ['MAR','Marrocos','🇲🇦','C',199,['Y. Bounou','M. Mohamedi','A. Hakimi','N. Mazraoui','N. Aguerd','R. Saïss','A. Masina','S. Amrabat','A. Ounahi','B. El Khannouss','H. Ziyech','A. Sabiri','Y. En-Nesyri','B. Díaz','A. El Kaabi','I. Akhomach'],'#C1272D'],
  ['HAI','Haiti','🇭🇹','C',217,['J. Duverger','A. Pierre','C. Arcus','R. Adé','C. Théodat','M. Cantave','F. Pierrot','D. Etienne Jr.','M. Guilavogui','R. Rodelin','S. Jérôme','K. Francillon','F. Milord','B. Désiré','D. Jean-Baptiste','C. Hérold'],'#00209F'],
  ['SCO','Escócia','🏴󠁧󠁢󠁳󠁣󠁴󠁿','C',235,['A. Gunn','Z. Clark','A. Robertson','K. Tierney','S. McKenna','J. Hendry','G. Hanley','S. McTominay','J. McGinn','B. Gilmour','C. McGregor','R. Christie','C. Adams','L. Dykes','L. Shankland','K. Nisbet'],'#0065BF'],
  ['USA','Estados Unidos','🇺🇸','D',253,['M. Turner','E. Horvath','S. Dest','T. Robinson','C. Richards','T. Ream','A. Robinson','W. McKennie','T. Adams','Y. Musah','G. Reyna','B. Aaronson','C. Pulisic','T. Weah','F. Balogun','R. Pepi'],'#0A3161'],
  ['PAR','Paraguai','🇵🇾','D',271,['R. Fernández','A. Silva','G. Gómez','F. Balbuena','O. Alderete','J. Alonso','R. Rojas','M. Villasanti','A. Cubas','D. Gómez','H. Velázquez','R. Sánchez','A. Enciso','J. Arce','I. Romero','A. Sanabria'],'#0038A8'],
  ['AUS','Austrália','🇦🇺','D',289,['M. Ryan','J. Langerak','A. Souttar','K. Rowles','N. Atkinson','A. Behich','J. King','J. Irvine','A. Hrustic','C. Goodwin','R. McGree','K. Baccus','M. Duke','M. Leckie','J. Maclaren','C. Kuol'],'#00843D'],
  ['TUR','Turquia','🇹🇷','D',307,['A. Bayındır','U. Çakır','M. Demiral','F. Kadıoğlu','S. Özkacar','K. Ayhan','Z. Çelik','H. Çalhanoğlu','A. Güler','Y. Yazıcı','K. Aktürkoğlu','S. Kökçü','B. Yılmaz','E. Ünder','K. Kılıç','Y. Akgün'],'#C8102E'],
  ['GER','Alemanha','🇩🇪','E',325,['M. ter Stegen','O. Baumann','A. Rüdiger','J. Tah','D. Raum','N. Schlotterbeck','B. Henrichs','J. Kimmich','T. Kroos','İ. Gündoğan','F. Wirtz','J. Musiala','L. Sané','K. Havertz','N. Füllkrug','T. Werner'],'#1A1A1A'],
  ['CUW','Curaçao','🇨🇼','E',343,['E. Room','Z. Breinburg','J. Bacuna','C. Martina','G. Donk','D. van den Bergh','R. Arendsz','L. Bacuna','K. Pietersz','S. Vijverberg','R. Hooi','G. Nepomuceno','Juninho Bacuna','R. Leerdam','E. Hooi','K. Brandao'],'#002B7F'],
  ['CIV','Costa do Marfim','🇨🇮','E',361,['Y. Fofana','B. Sangaré','S. Aurier','W. Boly','E. Bailly','O. Diomandé','G. Konan','F. Kessié','I. Sangaré','J. Faivre','S. Haller','N. Pépé','W. Zaha','M. Bamba','K. Boli','C. Kouamé'],'#E25303'],
  ['ECU','Equador','🇪🇨','E',379,['H. Galíndez','A. Domínguez','P. Hincapié','F. Torres','R. Arboleda','A. Pacho','D. Palacios','M. Caicedo','J. Franco','A. Sarmiento','G. Plata','K. Rodríguez','E. Valencia','M. Estrada','J. Corozo','L. Campana'],'#034EA2'],
  ['NED','Países Baixos','🇳🇱','F',397,['B. Verbruggen','M. Bijlow','V. van Dijk','N. Aké','D. Dumfries','J. Timber','L. de Ligt','F. de Jong','R. Gravenberch','X. Simons','T. Reijnders','D. Klaassen','C. Gakpo','M. Depay','D. Malen','J. Weghorst'],'#FF6600'],
  ['JPN','Japão','🇯🇵','F',415,['S. Suzuki','D. Ōsako','T. Tomiyasu','K. Itakura','Y. Nagatomo','H. Sakai','M. Yoshida','W. Endo','H. Dōan','T. Kubo','K. Mitoma','D. Kamada','J. Ito','A. Ueda','K. Furuhashi','D. Maeda'],'#0033A0'],
  ['SWE','Suécia','🇸🇪','F',433,['R. Olsen','P. Dahlberg','V. Lindelöf','A. Danielson','L. Augustinsson','E. Krafth','C. Starfelt','D. Kulusevski','E. Forsberg','A. Ekdal','J. Svanberg','M. Sema','A. Isak','V. Gyökeres','J. Larsson','A. Elanga'],'#006AA7'],
  ['TUN','Tunísia','🇹🇳','F',451,['A. Dahmen','B. Hassen','M. Talbi','Y. Meriah','D. Bronn','A. Abdi','W. Kechrida','E. Skhiri','A. Laidouni','H. Mejbri','N. Sliti','Y. Msakni','S. Jaziri','I. Jebali','W. Khazri','A. Khenissi'],'#CE1126'],
  ['BEL','Bélgica','🇧🇪','G',469,['T. Courtois','K. Casteels','J. Vertonghen','T. Alderweireld','A. Theate','T. Meunier','Z. Debast','K. De Bruyne','Y. Tielemans','A. Onana','O. Denda','L. Trossard','R. Lukaku','J. Doku','L. Openda','C. De Ketelaere'],'#000000'],
  ['EGY','Egito','🇪🇬','G',487,['M. El-Shenawy','E. El-Hadary','A. Hegazi','M. Abdel-Moneim','O. Kamal','A. Fatouh','Y. Hamdi','M. Elneny','A. Trezeguet','H. Ashour','M. Ibrahim','E. Ashour','M. Salah','M. Hassan','M. Sherif','O. Marmoush'],'#CE1126'],
  ['IRN','Irã','🇮🇷','G',505,['A. Beiranvand','P. Niazmand','S. Hosseini','M. Pouraliganji','E. Hajsafi','S. Moharrami','R. Rezaeian','A. Jahanbakhsh','S. Azmoun','S. Ezatolahi','A. Noorollahi','M. Torabi','M. Taremi','K. Ansarifard','S. Ghoddos','A. Gholizadeh'],'#CC1B1B'],
  ['NZL','Nova Zelândia','🇳🇿','G',523,['S. Sail','O. Bray','T. Smith','M. Boxall','N. De Vries','L. Cacace','D. Payne','J. Bell','M. Stamenic','S. Thomas','C. Wood','A. Waine','B. Old','M. Garbett','E. Just','C. Cacace'],'#000000'],
  ['ESP','Espanha','🇪🇸','H',541,['U. Simón','D. Raya','D. Carvajal','R. Le Normand','A. Laporte','M. Cucurella','J. Nacho','Rodri','Pedri','D. Olmo','F. López','Gavi','L. Yamal','A. Morata','N. Williams','F. Torres'],'#AA151B'],
  ['CPV','Cabo Verde','🇨🇻','H',559,['V. Osório','M. Rosa','S. Lopes','K. Brito','R. Fortes','L. Nando','C. Gracelino','J. Garry','N. Borges','K. Rodrigues','W. Furtado','P. Mendes','R. Brito','G. Rodrigues','L. Lopes','D. Tavares'],'#003893'],
  ['KSA','Arábia Saudita','🇸🇦','H',577,['M. Al-Owais','M. Al-Rubaie','Y. Al-Shahrani','A. Al-Amri','S. Al-Dawsari','H. Al-Burayk','A. Al-Bulayhi','S. Al-Dawsari','M. Kanno','A. Al-Malki','A. Al-Abed','F. Al-Muwallad','S. Al-Shehri','F. Al-Buraikan','A. Al-Ghannam','H. Hamdallah'],'#006C35'],
  ['URU','Uruguai','🇺🇾','H',595,['S. Rochet','F. Muslera','J.M. Giménez','R. Araújo','S. Coates','M. Viña','N. Nández','F. Valverde','R. Bentancur','M. Vecino','N. De la Cruz','G. De Arrascaeta','D. Núñez','L. Suárez','F. Pellistri','M. Araújo'],'#0038A8'],
  ['FRA','França','🇫🇷','I',613,['M. Maignan','B. Samba','D. Upamecano','W. Saliba','T. Hernández','J. Koundé','I. Konaté','A. Tchouaméni','E. Camavinga','A. Rabiot','A. Griezmann','O. Dembélé','K. Mbappé','M. Thuram','R. Kolo Muani','B. Barcola'],'#0055A4'],
  ['SEN','Senegal','🇸🇳','I',631,['É. Mendy','S. Dieng','K. Koulibaly','A. Diallo','Y. Sabaly','P. Sarr','F. Diagne','I. Gueye','N. Mendy','P. Gueye','C. Kouyaté','K. Diatta','S. Mané','I. Sarr','B. Dia','N. Jackson'],'#00853F'],
  ['IRQ','Iraque','🇮🇶','I',649,['J. Noor Sabri','F. Hameed','A. Fadhel','R. Yaser','A. Hadi','I. Bayesh','S. Abbas','I. Bayat','A. Al-Lami','M. Dawood','A. Tahseen','H. Abdulzahra','A. Mhawi','M. Ali','Y. Al-Amiri','A. Attwan'],'#CE1126'],
  ['NOR','Noruega','🇳🇴','I',667,['Ø. Nyland','M. Dyngeland','K. Ajer','L. Ostigard','B. Meling','S. Strandberg','J. Ryerson','M. Ødegaard','S. Berge','F. Aursnes','A. Moi Elyounoussi','M. Thorsby','E. Haaland','A. Sørloth','J. Strand Larsen','O. Nyland'],'#BA0C2F'],
  ['ARG','Argentina','🇦🇷','J',685,['E. Martínez','F. Armani','N. Otamendi','C. Romero','L. Martínez Quarta','N. Molina','M. Acuña','R. De Paul','L. Paredes','E. Fernández','A. Mac Allister','G. Lo Celso','L. Messi','L. Martínez','J. Álvarez','Á. Di María'],'#6CACE4'],
  ['ALG','Argélia','🇩🇿','J',703,['R. M\'Bolhi','A. Mandrea','A. Mandi','D. Benlamri','R. Bensebaini','Y. Atal','H. Belkebla','S. Bennacer','I. Bennacer','R. Mahrez','S. Feghouli','Y. Belaïli','I. Slimani','A. Bounedjah','M. Boulaya','S. Benrahma'],'#006233'],
  ['AUT','Áustria','🇦🇹','J',721,['P. Pentz','H. Lindner','D. Alaba','K. Danso','P. Lienhart','S. Posch','M. Wöber','K. Laimer','M. Sabitzer','F. Grillitsch','C. Baumgartner','X. Schlager','M. Arnautović','M. Gregoritsch','J. Seiwald','P. Wimmer'],'#ED2939'],
  ['JOR','Jordânia','🇯🇴','J',739,['Y. Al-Shafi','W. Garaibeh','A. Al-Bakhit','S. Al-Naimat','A. Hammad','F. Al-Tamari','N. Abu Zuraik','M. Abu Zuraik','Y. Al-Rawashdeh','B. Al-Saify','O. Al-Dardour','H. Al-Dmeiri','A. Al-Ersan','M. Al-Taamari','J. Haidar','S. Al-Naimat'],'#CE1126'],
  ['POR','Portugal','🇵🇹','K',757,['D. Costa','R. Silva','Pepe','R. Dias','N. Mendes','J. Cancelo','D. Dalot','B. Fernandes','B. Silva','V. Vitinha','J. Palhinha','J. Neves','Cristiano Ronaldo','R. Leão','G. Ramos','P. Neto'],'#006600'],
  ['COD','RD Congo','🇨🇩','K',775,['J. Kiassumbua','L. Mokonzi','C. Luyindama','A. Mbemba','N. Mukoko','A. Masuaku','I. Wissa','G. Kakuta','S. Bakambu','Y. Bolasie','C. Akolo','N. Mbemba','C. Bakambu','D. Mbokani','J. Malango','B. Dibu'],'#0033A0'],
  ['UZB','Uzbequistão','🇺🇿','K',793,['E. Nematov','B. Abdullaev','R. Khamdamov','A. Tuhtasinov','H. Alikulov','I. Ganiev','D. Nazarov','J. Khasanov','E. Shomurodov','O. Azizbek','A. Fayzullaev','D. Khashimov','I. Jaloliddinov','A. Sergeev','E. Zoteev','S. Rashidov'],'#0099B5'],
  ['COL','Colômbia','🇨🇴','K',811,['D. Ospina','C. Vargas','Y. Mina','D. Sánchez','J. Mojica','D. Muñoz','S. Arias','J. Cuadrado','J. Arias','J. Rodríguez','J. Lerma','L. Díaz','R. Falcao','D. Borré','L. Sinisterra','J. Durán'],'#003893'],
  ['ENG','Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿','L',829,['J. Pickford','A. Ramsdale','J. Stones','H. Maguire','M. Guéhi','K. Walker','T. Alexander-Arnold','J. Bellingham','D. Rice','C. Gallagher','P. Foden','B. Saka','H. Kane','O. Watkins','A. Gordon','C. Palmer'],'#1A1A1A'],
  ['CRO','Croácia','🇭🇷','L',847,['D. Livaković','I. Grbić','D. Lovren','J. Gvardiol','J. Šutalo','B. Sosa','J. Stanišić','L. Modrić','M. Brozović','M. Kovačić','L. Sučić','M. Pašalić','I. Perišić','A. Kramarić','B. Petković','M. Livaja'],'#C8102E'],
  ['GHA','Gana','🇬🇭','L',865,['R. Ati-Zigi','L. Ofori','D. Amartey','A. Djiku','T. Lamptey','A. Rahman Baba','G. Mensah','T. Partey','M. Kudus','I. Sulemana','A. Salis','E. Kyereh','I. Williams','A. Ayew','J. Ayew','A. Bukari'],'#006B3F'],
  ['PAN','Panamá','🇵🇦','L',883,['L. Mejía','O. Mosquera','F. Escobar','H. Cummings','E. Davis','M. Murillo','A. Godoy','A. Carrasquilla','É. Bárcenas','C. Martínez','A. Cooper','J. Rodríguez','G. Torres','J. Fajardo','R. Blackburn','I. Díaz'],'#072357'],
];

function buildTeams() {
  return TEAMS_RAW.map(([code, name, flag, group, start, players, color]) => {
    const stickers = [
      { num: start, label: 'Emblema', type: 'badge', team: code, teamName: name, localNum: 1, color },
      { num: start + 1, label: 'Foto da Equipe', type: 'team', team: code, teamName: name, localNum: 2, color },
    ];
    players.forEach((pName, i) => {
      const pos = POS_ORDER[i];
      stickers.push({ num: start + 2 + i, label: pName, type: pos.toLowerCase(), pos, team: code, teamName: name, localNum: i + 3, color });
    });
    return { code, name, flag, group, color, stickers };
  });
}

const TEAMS = buildTeams();

function getAllStickers() {
  const all = INTRO_STICKERS.map(s => ({ ...s, team: 'FWC', teamName: 'FIFA World Cup', localNum: s.num, color: '#8a6d00' }));
  TEAMS.forEach(t => all.push(...t.stickers));
  return all;
}

const ALL_STICKERS = getAllStickers();
const TOTAL_STICKERS = ALL_STICKERS.length;
const STICKER_MAP = {};
ALL_STICKERS.forEach(s => { STICKER_MAP[s.num] = s; });

/* ============================================================
   STATE HELPERS
   ============================================================ */
function getStickerState(num) { return state[num] || null; }
function isCollected(num) { return !!state[num]; }

function toggleCollected(num) {
  if (readOnly) return;
  if (state[num]) delete state[num];
  else state[num] = { c: true };
  saveState();
}

function setSpecial(num, special) {
  if (readOnly) return;
  if (!state[num]) state[num] = { c: true };
  if (special) state[num].s = special;
  else delete state[num].s;
  saveState();
}

function setPasted(num, pasted) {
  if (readOnly) return;
  if (!state[num]) state[num] = { c: true };
  if (pasted) state[num].p = true;
  else delete state[num].p;
  saveState();
}

function setDuplicates(num, count) {
  if (readOnly) return;
  if (!state[num]) state[num] = { c: true };
  if (count > 0) state[num].d = count;
  else delete state[num].d;
  saveState();
}

function removeSticker(num) {
  if (readOnly) return;
  delete state[num];
  saveState();
}

function clearAllState() {
  if (readOnly) return;
  state = {};
  savePending = true;
  clearTimeout(saveTimer);
  flushSave();
}

/* ============================================================
   STATS
   ============================================================ */
function calcStats() {
  let collected = 0, pasted = 0, dupes = 0, special = 0;
  for (const key in state) {
    if (state[key]) collected++;
    if (state[key]?.p) pasted++;
    if (state[key]?.d) dupes += state[key].d;
    if (state[key]?.s) special++;
  }
  return { collected, pasted, missing: TOTAL_STICKERS - collected, dupes, special };
}

function updateStats() {
  const s = calcStats();
  document.getElementById('statTotal').textContent = `${s.collected} / ${TOTAL_STICKERS}`;
  document.getElementById('statPasted').textContent = s.pasted;
  document.getElementById('statMissing').textContent = s.missing;
  document.getElementById('statDupes').textContent = s.dupes;
  document.getElementById('statSpecial').textContent = s.special;
  const pct = TOTAL_STICKERS > 0 ? (s.collected / TOTAL_STICKERS * 100) : 0;
  document.getElementById('statTotalFill').style.width = `${pct}%`;
  updateGroupProgress();
  updateDupesList();
}

/* ============================================================
   CELEBRATIONS (canvas-confetti)
   ============================================================ */
const celebratedSections = new Set();

function isSectionComplete(sectionKey) {
  if (sectionKey === 'FWC') return INTRO_STICKERS.every(s => isCollected(s.num));
  const team = TEAMS.find(t => t.code === sectionKey);
  return team ? team.stickers.every(s => isCollected(s.num)) : false;
}

function isGroupComplete(group) {
  return TEAMS.filter(t => t.group === group).every(t => t.stickers.every(s => isCollected(s.num)));
}

function isAlbumComplete() {
  return ALL_STICKERS.every(s => isCollected(s.num));
}

function celebrateSection(name) {
  if (typeof confetti !== 'function') return;
  confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: ['#00b894', '#0984e3', '#fdcb6e', '#e17055', '#6c5ce7'] });
  showToast(`🎉 ${name} completo!`);
}

function celebrateGroup(name) {
  if (typeof confetti !== 'function') return;
  confetti({ particleCount: 100, angle: 60, spread: 70, origin: { x: 0, y: 0.6 } });
  confetti({ particleCount: 100, angle: 120, spread: 70, origin: { x: 1, y: 0.6 } });
  showToast(`🎆 ${name} completo!`);
}

function celebrateAlbum() {
  if (typeof confetti !== 'function') return;
  const end = Date.now() + 5000;
  const interval = setInterval(() => {
    if (Date.now() > end) { clearInterval(interval); return; }
    confetti({
      particleCount: 30, startVelocity: 30, spread: 360, ticks: 60,
      origin: { x: Math.random(), y: Math.random() * 0.4 },
      colors: ['#ff0', '#f00', '#0f0', '#00f', '#ff6600', '#ff00ff'],
    });
  }, 200);
  showToast(`🏆 ÁLBUM COMPLETO! Parabéns!`);
}

function initCelebratedSections() {
  celebratedSections.clear();
  if (isSectionComplete('FWC')) celebratedSections.add('section:FWC');
  TEAMS.forEach(t => { if (isSectionComplete(t.code)) celebratedSections.add('section:' + t.code); });
  'ABCDEFGHIJKL'.split('').forEach(g => { if (isGroupComplete(g)) celebratedSections.add('group:' + g); });
  if (isAlbumComplete()) celebratedSections.add('album');
}

function checkCompletions(num) {
  const sticker = STICKER_MAP[num];
  if (!sticker || !isCollected(num)) return;

  if (!celebratedSections.has('album') && isAlbumComplete()) {
    celebratedSections.add('album');
    celebrateAlbum();
    return;
  }

  if (sticker.team !== 'FWC') {
    const team = TEAMS.find(t => t.code === sticker.team);
    if (team) {
      const groupKey = 'group:' + team.group;
      if (!celebratedSections.has(groupKey) && isGroupComplete(team.group)) {
        celebratedSections.add(groupKey);
        TEAMS.filter(t => t.group === team.group).forEach(t => celebratedSections.add('section:' + t.code));
        celebrateGroup(`Grupo ${team.group}`);
        return;
      }
    }
  }

  const sectionKey = 'section:' + sticker.team;
  if (!celebratedSections.has(sectionKey) && isSectionComplete(sticker.team)) {
    celebratedSections.add(sectionKey);
    const name = sticker.team === 'FWC' ? 'FIFA World Cup' : (TEAMS.find(t => t.code === sticker.team)?.name || sticker.team);
    celebrateSection(name);
  }
}

/* ============================================================
   FLAG HELPERS
   ============================================================ */
function flagEmojiToClass(emoji) {
  if (!emoji) return '';
  const codePoints = [...emoji].map(c => c.codePointAt(0));
  if (codePoints[0] === 0x1F3F4) {
    const letters = codePoints.slice(1, -1).map(cp => String.fromCharCode(cp - 0xE0000)).join('');
    if (letters.length === 5) return `fi-${letters.slice(0, 2)}-${letters.slice(2)}`.toLowerCase();
    return '';
  }
  if (codePoints.length === 2) {
    const letters = codePoints.map(cp => String.fromCharCode(cp - 0x1F1E6 + 65)).join('');
    return `fi-${letters}`.toLowerCase();
  }
  return '';
}

function flagHTML(emoji) {
  const cls = flagEmojiToClass(emoji);
  return cls ? `<span class="fi ${cls}"></span>` : emoji;
}

/* ============================================================
   AVATAR HELPERS
   ============================================================ */
function getInitials(label) {
  if (!label) return '?';
  const parts = label.split(/[\s.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return label.substring(0, 2).toUpperCase();
}

function avatarContent(s, collected) {
  if (!collected) {
    if (s.type === 'badge') return '🏛️';
    if (s.type === 'team') return '📸';
    if (s.type === 'stadium') return '🏟️';
    if (s.type === 'logo') return '🏆';
    if (s.type === 'mascot') return '🎭';
    return '?';
  }
  if (s.type === 'badge') return '🏛️';
  if (s.type === 'team') return '📸';
  if (s.type === 'stadium') return '🏟️';
  if (s.type === 'logo') return '🏆';
  if (s.type === 'mascot') return '🎭';
  return getInitials(s.label);
}

/* ============================================================
   RENDER STICKERS
   ============================================================ */
function renderSticker(s) {
  const st = getStickerState(s.num);
  const collected = !!st;
  const special = st?.s || '';
  const dupCount = st?.d || 0;
  const pasted = !!st?.p;
  const classes = ['sticker'];
  if (collected) classes.push('collected');
  if (pasted) classes.push('pasted');
  if (special) classes.push(`special-${special}`);

  const posLabel = s.pos ? POS_LABELS[s.pos] : (s.type === 'badge' ? 'Emblema' : s.type === 'team' ? 'Equipe' : s.type === 'stadium' ? 'Estádio' : '');
  const color = s.color || '#6b7280';

  return `<div class="${classes.join(' ')}" data-num="${s.num}" data-team="${s.team || ''}" data-name="${(s.label || '').toLowerCase()}" data-collected="${collected ? '1' : '0'}" data-dupes="${dupCount}" style="--sticker-color:${color}">
      ${special ? `<span class="sticker__badge-special">${SPECIAL_ICONS[special]}</span>` : ''}
      ${dupCount > 0 ? `<span class="sticker__badge-dupes">&times;${dupCount}</span>` : ''}
      ${pasted ? `<span class="sticker__badge-pasted">✓</span>` : ''}
      <span class="sticker__local-num">${s.team} ${s.localNum}</span>
      <span class="sticker__avatar">${avatarContent(s, collected)}</span>
      <span class="sticker__pos">${posLabel}</span>
      <span class="sticker__name" title="${s.label}">${s.label}</span>
      <span class="sticker__number">#${s.num}</span>
    </div>`;
}

function renderIntroSection() {
  const collectedCount = INTRO_STICKERS.filter(s => isCollected(s.num)).length;
  return `<div class="intro-section" data-section="FWC">
      <div class="intro-header">
        <span class="intro-header__badge">🏆</span>
        <span class="intro-header__title">FIFA World Cup 2026</span>
        <span class="intro-header__progress" data-progress="FWC">${collectedCount}/${INTRO_STICKERS.length}</span>
      </div>
      <div class="team-card open">
        <div class="team-card__body" style="display:block">
          <div class="sticker-grid">
            ${INTRO_STICKERS.map(s => renderSticker({ ...s, team: 'FWC', teamName: 'FIFA World Cup', localNum: s.num, color: '#8a6d00' })).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

function renderTeamCard(team) {
  const collectedCount = team.stickers.filter(s => isCollected(s.num)).length;
  const total = team.stickers.length;
  const pct = total > 0 ? (collectedCount / total * 100) : 0;
  return `<div class="team-card" data-team-code="${team.code}" data-group="${team.group}">
      <button class="team-card__header" aria-expanded="false">
        <span class="team-card__flag">${flagHTML(team.flag)}</span>
        <span class="team-card__name">${team.name}</span>
        <span class="team-card__count"><strong>${collectedCount}</strong>/${total}</span>
        <div class="team-card__progress"><div class="team-card__progress-fill" style="width:${pct}%"></div></div>
        <svg class="team-card__chevron" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"/></svg>
      </button>
      <div class="team-card__body">
        <div class="sticker-grid">${team.stickers.map(s => renderSticker(s)).join('')}</div>
      </div>
    </div>`;
}

function renderGroupSection(group, teams) {
  const allStickers = teams.flatMap(t => t.stickers);
  const collectedCount = allStickers.filter(s => isCollected(s.num)).length;
  return `<div class="group-section" data-group="${group}">
      <div class="group-header">
        <span class="group-header__badge">${group}</span>
        <span class="group-header__title">Grupo ${group}</span>
        <span class="group-header__progress" data-progress="group-${group}">${collectedCount}/${allStickers.length}</span>
      </div>
      ${teams.map(t => renderTeamCard(t)).join('')}
    </div>`;
}

function renderAlbum() {
  const container = document.getElementById('albumContainer');
  const groups = {};
  TEAMS.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });
  let html = renderIntroSection();
  'ABCDEFGHIJKL'.split('').forEach(g => {
    if (groups[g]) html += renderGroupSection(g, groups[g]);
  });
  container.innerHTML = html;
}

/* ============================================================
   PROGRESS UPDATE
   ============================================================ */
function updateGroupProgress() {
  document.querySelectorAll('[data-progress]').forEach(el => {
    const key = el.dataset.progress;
    if (key === 'FWC') {
      const count = INTRO_STICKERS.filter(s => isCollected(s.num)).length;
      el.textContent = `${count}/${INTRO_STICKERS.length}`;
    } else if (key.startsWith('group-')) {
      const g = key.replace('group-', '');
      const teams = TEAMS.filter(t => t.group === g);
      const all = teams.flatMap(t => t.stickers);
      const count = all.filter(s => isCollected(s.num)).length;
      el.textContent = `${count}/${all.length}`;
    }
  });
  document.querySelectorAll('.team-card').forEach(card => {
    const code = card.dataset.teamCode;
    const team = TEAMS.find(t => t.code === code);
    if (!team) return;
    const count = team.stickers.filter(s => isCollected(s.num)).length;
    const total = team.stickers.length;
    const pct = total > 0 ? (count / total * 100) : 0;
    const countEl = card.querySelector('.team-card__count');
    if (countEl) countEl.innerHTML = `<strong>${count}</strong>/${total}`;
    const fillEl = card.querySelector('.team-card__progress-fill');
    if (fillEl) fillEl.style.width = `${pct}%`;
  });
}

/* ============================================================
   DUPLICATES LIST
   ============================================================ */
function updateDupesList() {
  const container = document.getElementById('dupesContainer');
  const noDupes = document.getElementById('noDupes');
  const items = [];
  for (const numStr in state) {
    const s = state[numStr];
    if (s?.d && s.d > 0) {
      const sticker = STICKER_MAP[parseInt(numStr)];
      if (sticker) items.push({ num: sticker.num, label: sticker.label, team: sticker.teamName, localNum: sticker.localNum, teamCode: sticker.team, dupes: s.d });
    }
  }
  items.sort((a, b) => a.num - b.num);
  if (items.length === 0) {
    container.innerHTML = '';
    noDupes.hidden = false;
  } else {
    noDupes.hidden = true;
    container.innerHTML = items.map(it => `<div class="dupe-item">
        <span class="dupe-item__number">${it.teamCode} ${it.localNum}</span>
        <span class="dupe-item__name" title="${it.team} - ${it.label}">${it.label}</span>
        <span class="dupe-item__count">&times;${it.dupes}</span>
      </div>`).join('');
  }
}

/* ============================================================
   STICKER ELEMENT UPDATE
   ============================================================ */
function updateStickerEl(el, num) {
  const st = getStickerState(num);
  const collected = !!st;
  const special = st?.s || '';
  const dupCount = st?.d || 0;
  const pasted = !!st?.p;
  const sticker = STICKER_MAP[num];

  el.classList.toggle('collected', collected);
  el.classList.toggle('pasted', pasted);
  el.classList.remove('special-silver', 'special-gold', 'special-legend', 'special-parallel');
  if (special) el.classList.add(`special-${special}`);
  el.dataset.collected = collected ? '1' : '0';
  el.dataset.dupes = dupCount;

  const avatarEl = el.querySelector('.sticker__avatar');
  if (avatarEl && sticker) avatarEl.textContent = avatarContent(sticker, collected);

  let specialBadge = el.querySelector('.sticker__badge-special');
  if (special) {
    if (!specialBadge) { specialBadge = document.createElement('span'); specialBadge.className = 'sticker__badge-special'; el.prepend(specialBadge); }
    specialBadge.textContent = SPECIAL_ICONS[special];
  } else if (specialBadge) { specialBadge.remove(); }

  let dupesBadge = el.querySelector('.sticker__badge-dupes');
  if (dupCount > 0) {
    if (!dupesBadge) { dupesBadge = document.createElement('span'); dupesBadge.className = 'sticker__badge-dupes'; el.prepend(dupesBadge); }
    dupesBadge.innerHTML = `&times;${dupCount}`;
  } else if (dupesBadge) { dupesBadge.remove(); }

  let pastedBadge = el.querySelector('.sticker__badge-pasted');
  if (pasted) {
    if (!pastedBadge) { pastedBadge = document.createElement('span'); pastedBadge.className = 'sticker__badge-pasted'; el.prepend(pastedBadge); }
    pastedBadge.textContent = '✓';
  } else if (pastedBadge) { pastedBadge.remove(); }
}

/* ============================================================
   STICKER INTERACTIONS
   ============================================================ */
function handleStickerClick(e) {
  const stickerEl = e.target.closest('.sticker');
  if (!stickerEl) return;
  const num = parseInt(stickerEl.dataset.num);
  if (readOnly) {
    if (isCollected(num)) openModal(num, stickerEl);
    else showToast('Modo somente leitura. Insira o PIN para editar.');
    return;
  }
  if (isCollected(num)) {
    openModal(num, stickerEl);
  } else {
    toggleCollected(num);
    updateStickerEl(stickerEl, num);
    updateStats();
    checkCompletions(num);
  }
}

function handleStickerContext(e) {
  const stickerEl = e.target.closest('.sticker');
  if (!stickerEl) return;
  e.preventDefault();
  if (readOnly) {
    showToast('Modo somente leitura. Insira o PIN para editar.');
    return;
  }
  const num = parseInt(stickerEl.dataset.num);
  if (!isCollected(num)) {
    toggleCollected(num);
    updateStickerEl(stickerEl, num);
    updateStats();
    checkCompletions(num);
  }
  openModal(num, stickerEl);
}

/* ============================================================
   STICKER MODAL
   ============================================================ */
let modalCurrentNum = null;
let modalCurrentEl = null;

function openModal(num, stickerEl) {
  modalCurrentNum = num;
  modalCurrentEl = stickerEl;
  const sticker = STICKER_MAP[num];
  const st = getStickerState(num);
  const color = sticker?.color || '#6b7280';

  const header = document.getElementById('modalHeader');
  header.innerHTML = `
    <div class="modal__header-avatar" style="background:${color}">${avatarContent(sticker, true)}</div>
    <span class="modal__header-num">${sticker?.team || ''} ${sticker?.localNum || ''} &middot; #${num}</span>
    <span class="modal__header-name">${sticker?.label || ''}</span>
    <span class="modal__header-team">${sticker?.teamName || ''}</span>`;

  const special = st?.s || '';
  document.querySelectorAll('#specialButtons .special-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.special === special);
  });
  document.getElementById('dupesValue').textContent = st?.d || 0;
  document.getElementById('pastedToggle').classList.toggle('active', !!st?.p);

  document.querySelectorAll('#stickerModal .modal__field').forEach(f => { f.hidden = readOnly; });

  document.getElementById('modalOverlay').hidden = false;
}

function closeModal() {
  document.getElementById('modalOverlay').hidden = true;
  modalCurrentNum = null;
  modalCurrentEl = null;
}

function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('pastedToggle').addEventListener('click', () => {
    if (modalCurrentNum == null || readOnly) return;
    const st = getStickerState(modalCurrentNum);
    const newPasted = !st?.p;
    setPasted(modalCurrentNum, newPasted);
    document.getElementById('pastedToggle').classList.toggle('active', newPasted);
    if (modalCurrentEl) updateStickerEl(modalCurrentEl, modalCurrentNum);
    updateStats();
  });

  document.querySelectorAll('#specialButtons .special-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (modalCurrentNum == null || readOnly) return;
      const special = btn.dataset.special;
      setSpecial(modalCurrentNum, special || null);
      document.querySelectorAll('#specialButtons .special-btn').forEach(b => b.classList.toggle('active', b.dataset.special === special));
      if (modalCurrentEl) updateStickerEl(modalCurrentEl, modalCurrentNum);
      updateStats();
    });
  });

  document.getElementById('dupesMinus').addEventListener('click', () => {
    if (modalCurrentNum == null || readOnly) return;
    const cur = getStickerState(modalCurrentNum)?.d || 0;
    const next = Math.max(0, cur - 1);
    setDuplicates(modalCurrentNum, next);
    document.getElementById('dupesValue').textContent = next;
    if (modalCurrentEl) updateStickerEl(modalCurrentEl, modalCurrentNum);
    updateStats();
  });

  document.getElementById('dupesPlus').addEventListener('click', () => {
    if (modalCurrentNum == null || readOnly) return;
    const cur = getStickerState(modalCurrentNum)?.d || 0;
    setDuplicates(modalCurrentNum, cur + 1);
    document.getElementById('dupesValue').textContent = cur + 1;
    if (modalCurrentEl) updateStickerEl(modalCurrentEl, modalCurrentNum);
    updateStats();
  });

  document.getElementById('removeSticker').addEventListener('click', () => {
    if (modalCurrentNum == null || readOnly) return;
    removeSticker(modalCurrentNum);
    if (modalCurrentEl) updateStickerEl(modalCurrentEl, modalCurrentNum);
    updateStats();
    closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!document.getElementById('modalOverlay').hidden) closeModal();
      if (!document.getElementById('pinOverlay').hidden) document.getElementById('pinOverlay').hidden = true;
      if (!document.getElementById('shareOverlay').hidden) document.getElementById('shareOverlay').hidden = true;
    }
  });
}

/* ============================================================
   TEAM CARD EXPAND/COLLAPSE
   ============================================================ */
function initTeamCards() {
  document.getElementById('albumContainer').addEventListener('click', e => {
    const header = e.target.closest('.team-card__header');
    if (!header) return;
    const card = header.closest('.team-card');
    card.classList.toggle('open');
    header.setAttribute('aria-expanded', card.classList.contains('open'));
  });
}

/* ============================================================
   FILTERS
   ============================================================ */
let currentFilter = 'all';
let searchQuery = '';

function applyFilters() {
  document.querySelectorAll('.sticker').forEach(el => {
    const collected = el.dataset.collected === '1';
    const hasDupes = parseInt(el.dataset.dupes) > 0;
    const name = el.dataset.name || '';
    const team = (el.dataset.team || '').toLowerCase();
    const num = el.dataset.num || '';
    const isPasted = el.classList.contains('pasted');
    let showByFilter = true;
    if (currentFilter === 'collected') showByFilter = collected;
    else if (currentFilter === 'pasted') showByFilter = isPasted;
    else if (currentFilter === 'missing') showByFilter = !collected;
    else if (currentFilter === 'dupes') showByFilter = hasDupes;
    let showBySearch = true;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      showBySearch = name.includes(q) || team.includes(q) || num.includes(q);
      const teamObj = TEAMS.find(t => t.code === el.dataset.team);
      if (teamObj && teamObj.name.toLowerCase().includes(q)) showBySearch = true;
    }
    el.classList.toggle('hidden-filter', !(showByFilter && showBySearch));
  });
}

function initFilters() {
  document.querySelectorAll('#filterStatus .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filterStatus .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      applyFilters();
    });
  });
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { searchQuery = searchInput.value.trim(); applyFilters(); }, 200);
  });
}

/* ============================================================
   EXPAND ALL / CLEAR ALL
   ============================================================ */
function initActions() {
  let allExpanded = false;
  const expandBtn = document.getElementById('expandAll');
  expandBtn.addEventListener('click', () => {
    allExpanded = !allExpanded;
    document.querySelectorAll('.team-card').forEach(card => {
      card.classList.toggle('open', allExpanded);
      const h = card.querySelector('.team-card__header');
      if (h) h.setAttribute('aria-expanded', allExpanded);
    });
    expandBtn.textContent = allExpanded ? 'Recolher tudo' : 'Expandir tudo';
  });

  document.getElementById('clearAll').addEventListener('click', () => {
    if (readOnly) { showToast('Modo somente leitura.'); return; }
    if (!confirm('Tem certeza que deseja limpar todas as figurinhas deste álbum? Esta ação não pode ser desfeita.')) return;
    clearAllState();
    document.querySelectorAll('.sticker').forEach(el => updateStickerEl(el, parseInt(el.dataset.num)));
    updateStats();
  });
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function showView(view) {
  document.body.dataset.view = view;
}

async function openAlbum(code, pin) {
  showView('loading');
  try {
    const res = await api.get(code);
    currentCode = code;
    currentName = res.name;
    state = decodeAlbumData(res.data);

    if (pin) {
      currentPin = pin;
      readOnly = false;
    } else {
      currentPin = null;
      readOnly = true;
    }

    addRecentAlbum(code, pin, res.name);

    const url = new URL(window.location);
    url.searchParams.set('c', code);
    history.replaceState({}, '', url);

    initCelebratedSections();
    renderAlbumBar();
    renderAlbum();
    updateStats();
    showView('album');
  } catch (e) {
    alert(e.message || 'Erro ao carregar o álbum.');
    renderLanding();
    showView('landing');
  }
}

function goToLanding() {
  flushSave(false);
  currentCode = null;
  currentPin = null;
  currentName = null;
  state = {};
  readOnly = true;

  const url = new URL(window.location);
  url.searchParams.delete('c');
  history.replaceState({}, '', url);

  renderLanding();
  showView('landing');
}

/* ============================================================
   LANDING PAGE
   ============================================================ */
function renderLanding() {
  const container = document.getElementById('recentAlbums');
  const albums = getRecentAlbums();

  if (albums.length === 0) {
    container.innerHTML = '<p class="landing__empty">Nenhum álbum salvo. Crie um novo ou digite um código para acessar.</p>';
  } else {
    container.innerHTML = albums.map(a => `
      <div class="recent-album">
        <div class="recent-album__info">
          <span class="recent-album__name">${a.name}</span>
          <span class="recent-album__code">${a.code}</span>
        </div>
        <div class="recent-album__actions">
          <span class="recent-album__mode ${a.pin ? 'recent-album__mode--edit' : ''}">${a.pin ? '✎ Editor' : '👁 Leitor'}</span>
          <button class="recent-album__open" data-code="${a.code}">Abrir</button>
          <button class="recent-album__remove" data-code="${a.code}" title="Remover da lista">&times;</button>
        </div>
      </div>
    `).join('');
  }
}

function initLanding() {
  document.getElementById('recentAlbums').addEventListener('click', e => {
    const openBtn = e.target.closest('.recent-album__open');
    if (openBtn) {
      const code = openBtn.dataset.code;
      const pin = getStoredPin(code);
      openAlbum(code, pin);
      return;
    }
    const removeBtn = e.target.closest('.recent-album__remove');
    if (removeBtn) {
      removeRecentAlbum(removeBtn.dataset.code);
      renderLanding();
    }
  });

  const codeInput = document.getElementById('codeInput');
  const codeSubmit = document.getElementById('codeSubmit');

  codeSubmit.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code || code.length !== 6) { alert('O código deve ter 6 caracteres.'); return; }
    const pin = getStoredPin(code);
    openAlbum(code, pin);
  });

  codeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') codeSubmit.click();
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  document.getElementById('createNew').addEventListener('click', async () => {
    const name = prompt('Nome do álbum:');
    if (!name || !name.trim()) return;
    try {
      const res = await api.create(name.trim());
      addRecentAlbum(res.code, res.pin, res.name);
      showCreatedModal(res.code, res.pin, res.name);
    } catch (e) {
      alert(e.message || 'Erro ao criar álbum.');
    }
  });
}

/* ============================================================
   ALBUM BAR
   ============================================================ */
function renderAlbumBar() {
  document.getElementById('albumName').textContent = currentName;
  document.getElementById('albumCode').textContent = currentCode;
  const modeEl = document.getElementById('albumMode');
  if (readOnly) {
    modeEl.textContent = '👁 Somente leitura';
    modeEl.className = 'album-bar__mode album-bar__mode--readonly';
  } else {
    modeEl.textContent = '✎ Editor';
    modeEl.className = 'album-bar__mode album-bar__mode--edit';
  }
  document.getElementById('albumEnterPin').hidden = !readOnly;
}

function initAlbumBar() {
  document.getElementById('albumBack').addEventListener('click', goToLanding);
  document.getElementById('albumShare').addEventListener('click', openShareModal);
  document.getElementById('albumEnterPin').addEventListener('click', openPinModal);
}

/* ============================================================
   SHARE MODAL
   ============================================================ */
function openShareModal() {
  const link = `${window.location.origin}/album/?c=${currentCode}`;
  document.getElementById('shareLink').value = link;
  document.getElementById('sharePinValue').textContent = '****';
  document.getElementById('sharePinField').hidden = !currentPin;
  document.getElementById('shareOverlay').hidden = false;
}

function initShareModal() {
  document.getElementById('shareOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('shareOverlay').hidden = true;
  });
  document.getElementById('shareClose').addEventListener('click', () => {
    document.getElementById('shareOverlay').hidden = true;
  });
  document.getElementById('shareCopy').addEventListener('click', () => {
    const link = document.getElementById('shareLink').value;
    navigator.clipboard.writeText(link).then(() => showToast('Link copiado!'));
  });
  document.getElementById('shareWhatsApp').addEventListener('click', () => {
    const link = document.getElementById('shareLink').value;
    const text = `*${currentName} — Copa 2026*\nVeja as figurinhas: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  });
  document.getElementById('sharePinReveal').addEventListener('click', () => {
    const el = document.getElementById('sharePinValue');
    el.textContent = el.textContent === '****' ? currentPin : '****';
  });
}

/* ============================================================
   PIN MODAL
   ============================================================ */
function openPinModal() {
  document.getElementById('pinInput').value = '';
  document.getElementById('pinOverlay').hidden = false;
  setTimeout(() => document.getElementById('pinInput').focus(), 100);
}

function initPinModal() {
  document.getElementById('pinOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('pinOverlay').hidden = true;
  });
  document.getElementById('pinClose').addEventListener('click', () => {
    document.getElementById('pinOverlay').hidden = true;
  });

  const submit = async () => {
    const pin = document.getElementById('pinInput').value.trim();
    if (!pin || pin.length !== 4) { alert('O PIN deve ter 4 dígitos.'); return; }
    try {
      await api.update(currentCode, pin, { data: encodeAlbumData(state) });
      currentPin = pin;
      readOnly = false;
      addRecentAlbum(currentCode, pin, currentName);
      renderAlbumBar();
      document.getElementById('pinOverlay').hidden = true;
      showToast('PIN aceito! Modo de edição ativado.');
    } catch {
      alert('PIN incorreto.');
    }
  };

  document.getElementById('pinSubmit').addEventListener('click', submit);
  document.getElementById('pinInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
  });
}

/* ============================================================
   CREATED MODAL
   ============================================================ */
function showCreatedModal(code, pin, name) {
  document.getElementById('createdCode').textContent = code;
  document.getElementById('createdPin').textContent = pin;
  document.getElementById('createdName').textContent = name;
  document.getElementById('createdOverlay').hidden = false;
}

function initCreatedModal() {
  const go = () => {
    document.getElementById('createdOverlay').hidden = true;
    const code = document.getElementById('createdCode').textContent;
    const pin = document.getElementById('createdPin').textContent;
    openAlbum(code, pin);
  };
  document.getElementById('createdOk').addEventListener('click', go);
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove('toast--hide');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('toast--hide');
    setTimeout(() => { el.hidden = true; }, 300);
  }, 3000);
}

/* ============================================================
   HEADER
   ============================================================ */
function initHeader() {
  const header = document.getElementById('header');
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('nav');

  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  toggle.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => nav.classList.remove('open'));
  });
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  initHeader();
  initTeamCards();
  initModal();
  initFilters();
  initActions();
  initLanding();
  initAlbumBar();
  initShareModal();
  initPinModal();
  initCreatedModal();

  const container = document.getElementById('albumContainer');
  container.addEventListener('click', handleStickerClick);
  container.addEventListener('contextmenu', handleStickerContext);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave(true);
  });

  const url = new URL(window.location);
  const code = (url.searchParams.get('c') || '').toUpperCase();

  if (code && code.length === 6) {
    const pin = getStoredPin(code);
    await openAlbum(code, pin);
  } else {
    renderLanding();
    showView('landing');
  }
}

document.addEventListener('DOMContentLoaded', init);
