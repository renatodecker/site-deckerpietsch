/* ============================================================
   STICKER ALBUM TRACKER – Copa do Mundo FIFA 2026
   Cloud-synced version with shared albums
   ============================================================ */

const API_BASE = 'https://genctdyga3.execute-api.sa-east-1.amazonaws.com';
const POS_LABELS = { GOL: 'Goleiro', ZAG: 'Zagueiro', MEI: 'Meia', ATA: 'Atacante' };
const POS_ORDER = ['GOL','GOL','ZAG','ZAG','ZAG','ZAG','ZAG','ZAG','MEI','MEI','MEI','MEI','MEI','ATA','ATA','ATA','ATA','ATA'];
const SPECIAL_ICONS = { silver: '🥈', gold: '🥇', legend: '⭐', parallel: '🔷' };

let imageMap = {};
async function loadImageMap() {
  try {
    const res = await fetch('data/image-map.json');
    if (res.ok) imageMap = await res.json();
  } catch {}
  try {
    const stored = JSON.parse(localStorage.getItem('imageMap') || '{}');
    if (Object.keys(stored).length > Object.keys(imageMap).length) imageMap = stored;
  } catch {}
}

function stickerImageUrl(num, width = 200) {
  const filename = imageMap[num];
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replace(/ /g, '_'))}?width=${width}`;
}

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

const OLD_MIGRATION = (() => {
  const map = {};
  for (let i = 1; i <= 20; i++) {
    map[String(i)] = i === 1 ? '00' : `FWC${i - 1}`;
  }
  const oldTeams = [
    ['MEX',37],['KOR',55],['CZE',73],['RSA',91],
    ['CAN',109],['BIH',127],['QAT',145],['SUI',163],
    ['BRA',181],['MAR',199],['HAI',217],['SCO',235],
    ['USA',253],['PAR',271],['AUS',289],['TUR',307],
    ['GER',325],['CUW',343],['CIV',361],['ECU',379],
    ['NED',397],['JPN',415],['SWE',433],['TUN',451],
    ['BEL',469],['EGY',487],['IRN',505],['NZL',523],
    ['ESP',541],['CPV',559],['KSA',577],['URU',595],
    ['FRA',613],['SEN',631],['IRQ',649],['NOR',667],
    ['ARG',685],['ALG',703],['AUT',721],['JOR',739],
    ['POR',757],['COD',775],['UZB',793],['COL',811],
    ['ENG',829],['CRO',847],['GHA',865],['PAN',883],
  ];
  oldTeams.forEach(([code, start]) => {
    for (let i = 0; i < 18; i++) {
      map[String(start + i)] = `${code}${i + 1}`;
    }
  });
  return map;
})();

function migrateAlbumData(st) {
  const migrated = {};
  let didMigrate = false;
  for (const key in st) {
    const newKey = OLD_MIGRATION[key];
    if (newKey && STICKER_MAP[newKey]) {
      migrated[newKey] = st[key];
      didMigrate = true;
    } else if (STICKER_MAP[key]) {
      migrated[key] = st[key];
    }
  }
  return didMigrate ? migrated : st;
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
  { num: '00', label: 'Logo Panini', type: 'logo', localNum: 0 },
  { num: 'FWC1', label: 'Emblema Oficial', type: 'logo', localNum: 1 },
  { num: 'FWC2', label: 'Emblema Oficial', type: 'logo', localNum: 2 },
  { num: 'FWC3', label: 'Mascotes Oficiais', type: 'mascot', localNum: 3 },
  { num: 'FWC4', label: 'Slogan Oficial', type: 'logo', localNum: 4 },
  { num: 'FWC5', label: 'Bola Oficial', type: 'logo', localNum: 5 },
  { num: 'FWC6', label: 'Canadá - Países e Cidades-sede', type: 'logo', localNum: 6 },
  { num: 'FWC7', label: 'México - Países e Cidades-sede', type: 'logo', localNum: 7 },
  { num: 'FWC8', label: 'EUA - Países e Cidades-sede', type: 'logo', localNum: 8 },
  { num: 'FWC9', label: 'Itália 1934', type: 'logo', localNum: 9 },
  { num: 'FWC10', label: 'Uruguai 1950', type: 'logo', localNum: 10 },
  { num: 'FWC11', label: 'Alemanha Ocidental 1954', type: 'logo', localNum: 11 },
  { num: 'FWC12', label: 'Brasil 1962', type: 'logo', localNum: 12 },
  { num: 'FWC13', label: 'Alemanha Ocidental 1974', type: 'logo', localNum: 13 },
  { num: 'FWC14', label: 'Argentina 1986', type: 'logo', localNum: 14 },
  { num: 'FWC15', label: 'Brasil 1994', type: 'logo', localNum: 15 },
  { num: 'FWC16', label: 'Brasil 2002', type: 'logo', localNum: 16 },
  { num: 'FWC17', label: 'Itália 2006', type: 'logo', localNum: 17 },
  { num: 'FWC18', label: 'Alemanha 2014', type: 'logo', localNum: 18 },
  { num: 'FWC19', label: 'Argentina 2022', type: 'logo', localNum: 19 },
];

const TEAMS_RAW = [
  ['MEX','México','🇲🇽','A',['Luis Malagon','Johan Vasquez','Jorge Sanchez','Cesar Montes','Jesus Gallardo','Israel Reyes','Diego Lainez','Carlos Rodriguez','Edson Alvarez','Orbelin Pineda','Marcel Ruiz','Erick Sanchez','Hirving Lozano','Santiago Gimenez','Raul Jimenez','Alexis Vega','Roberto Alvarado','Cesar Huerta'],'#0B5C36'],
  ['RSA','África do Sul','🇿🇦','A',['Ronwen Williams','Sipho Chaine','Aubrey Modiba','Samukele Kabini','Mbekezeli Mbokazi','Khulumani Ndamane','Siyabonga Ngezana','Khuliso Mudau','Nkosinathi Sibisi','Teboho Mokoena','Thalente Mbatha','Bathasi Aubaas','Yaya Sithole','Sipho Mbule','Lyle Foster','Iqraam Rayners','Mohau Nkota','Oswin Appollis'],'#007A4D'],
  ['KOR','Coreia do Sul','🇰🇷','A',['Hyeon-woo Jo','Seung-Gyu Kim','Min-jae Kim','Yu-min Cho','Young-woo Seol','Han-beom Lee','Tae-seok Lee','Myung-jae Lee','Jae-sung Lee','In-beom Hwang','Kang-in Lee','Seung-ho Paik','Jens Castrop','Dongg-yeong Lee','Gue-sung Cho','Heung-min Son','Hee-chan Hwang','Hyeon-Gyu Oh'],'#001F4D'],
  ['CZE','Tchéquia','🇨🇿','A',['Matej Kovar','Jindrich Stanek','Ladislav Krejci','Vladimir Coufal','Jaroslav Zeleny','Tomas Holes','David Zima','Michal Sadilek','Lukas Provod','Lukas Cerv','Tomas Soucek','Pavel Sulc','Matej Vydra','Vasil Kusej','Tomas Chory','Vaclav Cerny','Adam Hlozek','Patrik Schick'],'#11457E'],
  ['CAN','Canadá','🇨🇦','B',['Dayne St. Clair','Alphonso Davies','Alistair Johnston','Samuel Adekugbe','Riche Larvea','Derek Cornelius','Moise Bombito','Kamal Miller','Stephen Eustaquio','Ismael Kone','Jonathan Osorio','Jacob Shaffelburg','Mathieu Choiniere','Niko Sigur','Tajon Buchanan','Liam Millar','Cyle Larin','Jonathan David'],'#D52B1E'],
  ['BIH','Bósnia-Herz.','🇧🇦','B',['Nikola Vasilj','Amer Dedic','Sead Kolasinac','Tarik Muharemovic','Nihad Mujakic','Nikola Katic','Amir Hadziahmetovic','Benjamin Tahirovic','Armin Gigovic','Ivan Sunjic','Ivan Basic','Dzenis Burnic','Esmir Bajraktarevic','Amar Memic','Ermedin Demirovic','Edin Dzeko','Samed Bazdar','Haris Tabakovic'],'#002B7F'],
  ['QAT','Catar','🇶🇦','B',['Meshaal Barsham','Sultan Albrake','Lucas Mendes','Homam Ahmed','Boualem Khoukhi','Pedro Miguel','Tarek Salman','Mohamed Al-Mannai','Karim Boudiaf','Assim Madibo','Ahmed Fatehi','Mohammed Waad','Abdulaziz Hatem','Hassan Al-Haydos','Edmilson Junior','Akram Hassan Afif','Ahmed Al Ganehi','Almoez Ali'],'#8A1538'],
  ['SUI','Suíça','🇨🇭','B',['Gregor Kobel','Yvon Mvogo','Manuel Akanji','Ricardo Rodriguez','Nico Elvedi','Aurele Amenda','Silvan Widmer','Granit Xhaka','Denis Zakaria','Remo Freuler','Fabian Rieder','Ardon Jashari','Johan Manzambi','Michel Aebischer','Breel Embolo','Ruben Vargas','Dan Ndoye','Zeki Amdouni'],'#B22222'],
  ['BRA','Brasil','🇧🇷','C',['Alisson','Bento','Marquinhos','Eder Militao','Gabriel Magalhaes','Danilo','Wesley','Lucas Paqueta','Casemiro','Bruno Guimaraes','Luiz Henrique','Vinicius Junior','Rodrygo','Joao Pedro','Matheus Cunha','Gabriel Martinelli','Raphinha','Estevao'],'#0B4A2C'],
  ['MAR','Marrocos','🇲🇦','C',['Yassine Bounou','Munir El Kajoui','Achraf Hakimi','Noussair Mazraoui','Nayef Aguerd','Roman Saiss','Jawad El Yamio','Adam Masina','Sofyan Amrabat','Azzedine Ounahi','Eliesse Ben Seghir','Bilal El Khannouss','Ismael Saibari','Youssef En-Nesyri','Abde Ezzalzouli','Soufiane Rahimi','Brahim Diaz','Ayoub El Kaabi'],'#C1272D'],
  ['HAI','Haiti','🇭🇹','C',['Johny Placide','Carlens Arcus','Martin Experience','Jean-Kevin Duverne','Ricardo Ade','Duke Lacroix','Garven Metusala','Hannes Delcroix','Leverton Pierre','Danley Jean Jacques','Jean-Ricner Bellegarde','Christopher Attys','Derrick Etienne Jr','Josue Casimir','Ruben Providence','Duckens Nazon','Louicius Deedson','Frantzdy Pierrot'],'#00209F'],
  ['SCO','Escócia','🏴󠁧󠁢󠁳󠁣󠁴󠁿','C',['Angus Gunn','Jack Hendry','Kieran Tierney','Aaron Hickey','Andrew Robertson','Scott McKenna','John Souttar','Anthony Ralston','Grant Hanley','Scott McTominay','Billy Gilmour','Lewis Ferguson','Ryan Christie','Kenny McLean','John McGinn','Lyndon Dykes','Che Adams','Ben Gannon-Doak'],'#0065BF'],
  ['USA','Estados Unidos','🇺🇸','D',['Matt Freese','Chris Richards','Tim Ream','Mark McKenzie','Alex Freeman','Antonee Robinson','Tyler Adams','Tanner Tessmann','Weston McKennie','Christian Roldan','Timothy Weah','Diego Luna','Malik Tillman','Christian Pulisic','Brenden Aaronson','Ricardo Pepi','Haji Wright','Folarin Balogun'],'#0A3161'],
  ['PAR','Paraguai','🇵🇾','D',['Roberto Fernandez','Orlando Gill','Gustavo Gomez','Fabian Balbuena','Juan Jose Caceres','Omar Alderete','Junior Alonso','Mathias Villasanti','Diego Gomez','Damian Bobadilla','Andres Cubas','Matias Galarza Fonda','Julio Enciso','Alejandro Romero Gamarra','Miguel Almiron','Ramon Sosa','Angel Romero','Antonio Sanabria'],'#0038A8'],
  ['AUS','Austrália','🇦🇺','D',['Mathew Ryan','Joe Gauci','Harry Souttar','Alessandro Circati','Jordan Bos','Aziz Behich','Cameron Burgess','Lewis Miller','Milos Degenek','Jackson Irvine','Riley McGree','Aiden O\'Neill','Connor Metcalfe','Patrick Yazbek','Craig Goodwin','Kusini Vengi','Nestory Irankunda','Mohamed Toure'],'#00843D'],
  ['TUR','Turquia','🇹🇷','D',['Ugurcan Cakir','Mert Muldur','Zeki Celik','Abdulkerim Bardakci','Caglar Soyuncu','Merih Demiral','Ferdi Kadioglu','Kaan Ayhan','Ismail Yuksek','Hakan Calhanoglu','Orkun Kokcu','Arda Guler','Irfan Can Kahveci','Yunus Akgun','Can Uzun','Baris Alper Yilmaz','Kerem Akturkoglu','Kenan Yildiz'],'#C8102E'],
  ['GER','Alemanha','🇩🇪','E',['Marc-Andre ter Stegen','Jonathan Tah','David Raum','Nico Schlotterbeck','Antonio Rudiger','Waldemar Anton','Ridle Baku','Maximilian Mittelstadt','Joshua Kimmich','Florian Wirtz','Felix Nmecha','Leon Goretzka','Jamal Musiala','Serge Gnabry','Kai Havertz','Leroy Sane','Karim Adeyemi','Nick Woltemade'],'#1A1A1A'],
  ['CIV','Costa do Marfim','🇨🇮','E',['Yahia Fofana','Ghislain Konan','Wilfried Singo','Odilon Kossounou','Evan Ndicka','Willy Boly','Emmanuel Agbadou','Ousmane Diomande','Franck Kessie','Seko Fofana','Ibrahim Sangare','Jean-Philippe Gbamin','Amad Diallo','Sebastien Haller','Simon Adingra','Yan Diomande','Evann Guessand','Oumar Diakite'],'#E25303'],
  ['ECU','Equador','🇪🇨','E',['Hernan Galindez','Gonzalo Valle','Piero Hincapie','Pervis Estupinian','Willian Pacho','Angelo Preciado','Joel Ordonez','Moises Caicedo','Alan Franco','Kendry Paez','Pedro Vite','John Veboah','Leonardo Campana','Gonzalo Plata','Nilson Angulo','Alan Minda','Kevin Rodriguez','Enner Valencia'],'#034EA2'],
  ['CUW','Curaçao','🇨🇼','E',['Eloy Room','Armando Obispo','Sherel Floranus','Jurien Gaari','Joshua Brenet','Roshon Van Eijma','Shurandy Sambo','Livano Comenencia','Godfried Roemeratoe','Juninho Bacuna','Leandro Bacuna','Tahith Chong','Kenji Gorre','Jearl Margaritha','Jurgen Locadia','Jeremy Antonisse','Gervane Kastaneer','Sontje Hansen'],'#002B7F'],
  ['NED','Países Baixos','🇳🇱','F',['Bart Verbruggen','Virgil van Dijk','Micky van de Ven','Jurrien Timber','Denzel Dumfries','Nathan Ake','Jeremie Frimpong','Jan Paul van Hecke','Tijjani Reijnders','Ryan Gravenberch','Teun Koopmeiners','Frenkie de Jong','Xavi Simons','Justin Kluivert','Memphis Depay','Donyell Malen','Wout Weghorst','Cody Gakpo'],'#FF6600'],
  ['JPN','Japão','🇯🇵','F',['Zion Suzuki','Henry Heroki Mochizuki','Ayumu Seko','Junnosuke Suzuki','Shogo Taniguchi','Tsuyoshi Watanabe','Kaishu Sano','Yuki Soma','Ao Tanaka','Daichi Kamada','Takefusa Kubo','Ritsu Doan','Keito Nakamura','Takumi Minamino','Shuto Machino','Junya Ito','Koki Ogawa','Ayase Ueda'],'#0033A0'],
  ['SWE','Suécia','🇸🇪','F',['Victor Johansson','Isak Hien','Gabriel Gudmundsson','Emil Holm','Victor Nilsson Lindelof','Gustaf Lagerbielke','Lucas Bergvall','Hugo Larsson','Jesper Karlstrom','Yasin Ayari','Mattias Svanberg','Daniel Svensson','Ken Sema','Roony Bardghji','Dejan Kulusevski','Anthony Elanga','Alexander Isak','Viktor Gyokeres'],'#006AA7'],
  ['TUN','Tunísia','🇹🇳','F',['Bechir Ben Said','Aymen Dahmen','Yan Valery','Montassar Talbi','Yassine Meriah','Ali Abdi','Dylan Bronn','Ellyes Skhiri','Aissa Laidouni','Ferjani Sassi','Mohamed Ali Ben Romdhane','Hannibal Mejbri','Elias Achouri','Elias Saad','Hazem Mastouri','Ismael Gharbi','Sayfallah Ltaief','Naim Sliti'],'#CE1126'],
  ['BEL','Bélgica','🇧🇪','G',['Thibaut Courtois','Arthur Theate','Timothy Castagne','Zeno Debast','Brandon Mechele','Maxim De Cuyper','Thomas Meunier','Youri Tielemans','Amadou Onana','Nicolas Raskin','Alexis Saelemaekers','Hans Vanaken','Kevin De Bruyne','Jeremy Doku','Charles De Ketelaere','Leandro Trossard','Lois Openda','Romelu Lukaku'],'#000000'],
  ['EGY','Egito','🇪🇬','G',['Mohamed El Shenawy','Mohamed Hany','Mohamed Hamdy','Yasser Ibrahim','Khaled Sobhi','Ramy Rabia','Hossam Abdelmaguid','Ahmed Fatouh','Marwan Attia','Zizo','Hamdy Fathy','Mohamed Lasheen','Emam Ashour','Osama Faisal','Mohamed Salah','Mostafa Mohamed','Trezeguet','Omar Marmoush'],'#CE1126'],
  ['IRN','Irã','🇮🇷','G',['Alireza Beiranvand','Morteza Pouraliganji','Ehsan Hajsafi','Milad Mohammadi','Shojae Khalilzadeh','Ramin Rezaeian','Hossein Kanaani','Sadegh Moharrami','Saleh Hardani','Saeed Ezatolahi','Saman Ghoddos','Omid Noorafkan','Roozbeh Cheshmi','Mohammad Mohebi','Sardar Azmoun','Mehdi Taremi','Alireza Jahanbakhsh','Ali Gholizadeh'],'#CC1B1B'],
  ['NZL','Nova Zelândia','🇳🇿','G',['Max Crocombe Payne','Alex Paulsen','Michael Boxall','Liberato Cacace','Tim Payne','Tyler Bindon','Francis de Vries','Finn Surman','Joe Bell','Sarpreet Singh','Ryan Thomas','Matthew Garbett','Marko Stamenic','Ben Old','Chris Wood','Elijah Just','Callum McCowatt','Kosta Barbarouses'],'#000000'],
  ['ESP','Espanha','🇪🇸','H',['Unai Simon','Robin Le Normand','Aymeric Laporte','Dean Huijsen','Pedro Porro','Dani Carvajal','Marc Cucurella','Martin Zubimendi','Rodri','Pedri','Fabian Ruiz','Mikel Merino','Lamine Yamal','Dani Olmo','Nico Williams','Ferran Torres','Alvaro Morata','Mikel Oyarzabal'],'#AA151B'],
  ['URU','Uruguai','🇺🇾','H',['Sergio Rochet','Santiago Mele','Ronald Araujo','Jose Maria Gimenez','Sebastian Caceres','Mathias Olivera','Guillermo Varela','Nahitan Nandez','Federico Valverde','Giorgian De Arrascaeta','Rodrigo Bentancur','Manuel Ugarte','Nicolas de la Cruz','Maxi Araujo','Darwin Nunez','Federico Vinas','Rodrigo Aguirre','Facundo Pellistri'],'#0038A8'],
  ['CPV','Cabo Verde','🇨🇻','H',['Vozinha','Logan Costa','Pico','Diney','Steven Moreira','Wagner Pina','Joao Paulo','Yannick Semedo','Kevin Pina','Patrick Andrade','Jamiro Monteiro','Deroy Duarte','Garry Rodrigues','Jovane Cabral','Ryan Mendes','Dailon Livramento','Willy Semedo','Bebe'],'#003893'],
  ['KSA','Arábia Saudita','🇸🇦','H',['Nawaf Alaqidi','Abdulrahman Al-Sanbi','Saud Abdulhamid','Nawaf Bouwashl','Jihad Thakri','Moteb Al-Harbi','Hassan Altambakti','Musab Aljuwayr','Ziyad Aljohani','Abdullah Alkhaibari','Nasser Aldawsari','Saleh Abu Alshamat','Marwan Alsahafi','Salem Aldawsari','Abdulrahman Al-Aboud','Feras Akbrikan','Saleh Alshehri','Abdullah Al-Hamdan'],'#006C35'],
  ['FRA','França','🇫🇷','I',['Mike Maignan','Theo Hernandez','William Saliba','Jules Kounde','Ibrahima Konate','Dayot Upamecano','Lucas Digne','Aurelien Tchouameni','Eduardo Camavinga','Manu Kone','Adrien Rabiot','Michael Olise','Ousmane Dembele','Bradley Barcola','Desire Doue','Kingsley Coman','Hugo Ekitike','Kylian Mbappe'],'#0055A4'],
  ['NOR','Noruega','🇳🇴','I',['Orjan Nyland','Julian Ryerson','Leo Ostigard','Kristoffer Vassbakk Ajer','Marcus Holmgren Pedersen','David Moller Wolfe','Torbjorn Heggem','Morten Thorsby','Martin Odegaard','Sander Berge','Andreas Schjelderup','Patrick Berg','Erling Haaland','Alexander Sorloth','Aron Donnum','Jorgen Strand Larsen','Antonio Nusa','Oscar Bobb'],'#BA0C2F'],
  ['SEN','Senegal','🇸🇳','I',['Edouard Mendy','Yehvann Diouf','Moussa Niakhate','Abdoulaye Seck','Ismail Jakobs','El Hadji Malick Diouf','Kalidou Koulibaly','Idrissa Gana Gueye','Pape Matar Sarr','Pape Gueye','Habib Diarra','Lamine Camara','Sadio Mane','Ismaila Sarr','Boulaye Dia','Iliman Ndiaye','Nicolas Jackson','Krepin Diatta'],'#00853F'],
  ['IRQ','Iraque','🇮🇶','I',['Jalal Hassan','Rebin Sulaka','Hussein Ali','Akam Hashem','Merchas Doski','Zaid Tahseen','Manaf Younis','Zidane Iqbal','Amir Al-Ammari','Ibrahim Bavesh','Ali Jasim','Youssef Amyn','Aimar Sher','Marko Farji','Osama Rashid','Ali Al-Hamadi','Aymen Hussein','Mohanad Ali'],'#CE1126'],
  ['ARG','Argentina','🇦🇷','J',['Emiliano Martinez','Nahuel Molina','Cristian Romero','Nicolas Otamendi','Nicolas Tagliafico','Leonardo Balerdi','Enzo Fernandez','Alexis Mac Allister','Rodrigo De Paul','Exequiel Palacios','Leandro Paredes','Nico Paz','Franco Mastantuono','Nico Gonzalez','Lionel Messi','Lautaro Martinez','Julian Alvarez','Giuliano Simeone'],'#6CACE4'],
  ['AUT','Áustria','🇦🇹','J',['Alexander Schlager','Patrick Pentz','David Alaba','Kevin Danso','Philipp Lienhart','Stefan Posch','Phillipp Mwene','Alexander Prass','Xaver Schlager','Marcel Sabitzer','Konrad Laimer','Florian Grillitsch','Nicolas Seiwald','Romano Schmid','Patrick Wimmer','Christoph Baumgartner','Michael Gregoritsch','Marko Arnautovic'],'#ED2939'],
  ['ALG','Argélia','🇩🇿','J',['Alexis Guendouz','Ramy Bensebaini','Youcef Atal','Rayan Ait-Nouri','Mohamed Amine Tougai','Aissa Mandi','Ismael Bennacer','Houssem Aquar','Hicham Boudaoui','Ramiz Zerrouki','Nabil Bentalab','Fares Chaibi','Riyad Mahrez','Said Benrahma','Anis Hadj Moussa','Amine Gouiri','Baghdad Bounedjah','Mohammed Amoura'],'#006233'],
  ['JOR','Jordânia','🇯🇴','J',['Yazeed Abulaila','Ihsan Haddad','Mohammad Abu Hashish','Yazan Al-Arab','Abdallah Nasib','Saleem Obaid','Mohammad Abualnadi','Ibrahim Saadeh','Nizar Al-Rashdan','Noor Al-Rawabdeh','Mohannad Abu Taha','Amer Jamous','Musa Al-Taamari','Yazan Al-Naimat','Mahmoud Al-Mardi','Ali Olwan','Mohammad Abu Zrayq','Ibrahim Sabra'],'#CE1126'],
  ['COL','Colômbia','🇨🇴','K',['Camilo Vargas','David Ospina','Davinson Sanchez','Yerry Mina','Daniel Munoz','Johan Mojica','Jhon Lucumi','Santiago Arias','Jefferson Lerma','Kevin Castano','Richard Rios','James Rodriguez','Juan Fernando Quintero','Jorge Carrascal','Jon Arias','Jhon Cordova','Luis Suarez','Luis Diaz'],'#003893'],
  ['POR','Portugal','🇵🇹','K',['Diogo Costa','Jose Sa','Ruben Dias','Joao Cancelo','Diogo Dalot','Nuno Mendes','Goncalo Inacio','Bernardo Silva','Bruno Fernandes','Ruben Neves','Vitinha','Joao Neves','Cristiano Ronaldo','Francisco Trincao','Joao Felix','Goncalo Ramos','Pedro Neto','Rafael Leao'],'#006600'],
  ['COD','RD Congo','🇨🇩','K',['Lionel Mpasi','Aaron Wan-Bissaka','Axel Tuanzebe','Arthur Masuaku','Chancel Mbemba','Joris Kayembe','Charles Pickel','Ngal\'ayel Mukau','Edo Kayembe','Samuel Moutoussamy','Noah Sadiki','Theo Bongonda','Meschak Elia','Yoane Wissa','Brian Cipenga','Fiston Mayele','Cedric Bakambu','Nathanael Mbuku'],'#0033A0'],
  ['UZB','Uzbequistão','🇺🇿','K',['Utkir Yusupov','Farrukh Savfiev','Sherzod Nasrullaev','Umar Eshmurodov','Husniddin Aliqulov','Rustamjon Ashurmatov','Khojiakbar Alijonov','Abdukodir Khusanov','Odiljon Hamrobekov','Otabek Shukurov','Jamshid Iskanderov','Azizbek Turgunboev','Khojimat Erkinov','Eldor Shomurodov','Oston Urunov','Jaloliddin Masharipov','Igor Sergeev','Abbosbek Fayzullaev'],'#0099B5'],
  ['ENG','Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿','L',['Jordan Pickford','John Stones','Marc Guehi','Ezri Konsa','Trent Alexander-Arnold','Reece James','Dan Burn','Jordan Henderson','Declan Rice','Jude Bellingham','Cole Palmer','Morgan Rogers','Anthony Gordon','Phil Foden','Bukayo Saka','Harry Kane','Marcus Rashford','Ollie Watkins'],'#1A1A1A'],
  ['GHA','Gana','🇬🇭','L',['Lawrence Ati Zigi','Tariq Lamptey','Mohammed Salisu','Alidu Seidu','Alexander Djiku','Gideon Mensah','Caleb Yirenkyi','Abdul Issahaku Fatawu','Thomas Partey','Salis Abdul Samed','Kamaldeen Sulemana','Mohammed Kudus','Inaki Williams','Jordan Ayew','Andrew Ayew','Joseph Paintsil','Osman Bukari','Antoine Semenyo'],'#006B3F'],
  ['CRO','Croácia','🇭🇷','L',['Dominik Livakovic','Duje Caleta-Car','Josko Gvardiol','Josip Stanisic','Luka Vuskovic','Josip Sutalo','Kristijan Jakic','Luka Modric','Mateo Kovacic','Martin Baturina','Lovro Majer','Mario Pasalic','Petar Sucic','Ivan Perisic','Marco Pasalic','Ante Budimir','Andrej Kramaric','Franjo Ivanovic'],'#C8102E'],
  ['PAN','Panamá','🇵🇦','L',['Orlando Mosquera','Luis Mejia','Fidel Escobar','Andres Andrade','Michael Amir Murillo','Eric Davis','Jose Cordoba','Cesar Blackman','Cristian Martinez','Anibal Godoy','Adalberto Carrasquilla','Edgar Barcenas','Carlos Harvey','Ismael Diaz','Jose Fajardo','Cecilio Waterman','Jose Luiz Rodriguez','Alberto Quintero'],'#072357'],
];

function buildTeams() {
  return TEAMS_RAW.map(([code, name, flag, group, players, color]) => {
    const stickers = [];
    stickers.push({ num: `${code}1`, label: 'Escudo', type: 'badge', team: code, teamName: name, localNum: 1, color });
    for (let i = 0; i < 11; i++) {
      const pos = POS_ORDER[i];
      stickers.push({ num: `${code}${i + 2}`, label: players[i], type: pos.toLowerCase(), pos, team: code, teamName: name, localNum: i + 2, color });
    }
    stickers.push({ num: `${code}13`, label: 'Foto do Time', type: 'team', team: code, teamName: name, localNum: 13, color });
    for (let i = 11; i < 18; i++) {
      const pos = POS_ORDER[i];
      stickers.push({ num: `${code}${i + 3}`, label: players[i], type: pos.toLowerCase(), pos, team: code, teamName: name, localNum: i + 3, color });
    }
    return { code, name, flag, group, color, stickers };
  });
}

const TEAMS = buildTeams();

function getAllStickers() {
  const all = INTRO_STICKERS.map(s => ({ ...s, team: 'FWC', teamName: 'FIFA World Cup', color: '#8a6d00' }));
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

function avatarFallback(s, collected) {
  if (s.type === 'badge') return '🏛️';
  if (s.type === 'team') return '📸';
  if (s.type === 'stadium') return '🏟️';
  if (s.type === 'logo') return '🏆';
  if (s.type === 'mascot') return '🎭';
  return collected ? getInitials(s.label) : '?';
}

function avatarContent(s, collected) {
  const fallback = avatarFallback(s, collected);
  if (collected && imageMap[s.num]) {
    const url = stickerImageUrl(s.num, 200);
    return `<img src="${url}" alt="${s.label}" loading="lazy" class="sticker__photo" onerror="this.remove()">${fallback}`;
  }
  return fallback;
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
            ${INTRO_STICKERS.map(s => renderSticker({ ...s, team: 'FWC', teamName: 'FIFA World Cup', color: '#8a6d00' })).join('')}
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
      const sticker = STICKER_MAP[numStr];
      if (sticker) items.push({ num: sticker.num, label: sticker.label, team: sticker.teamName, localNum: sticker.localNum, teamCode: sticker.team, dupes: s.d });
    }
  }
  items.sort((a, b) => String(a.num).localeCompare(String(b.num)));
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
  if (avatarEl && sticker) avatarEl.innerHTML = avatarContent(sticker, collected);

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
  const num = stickerEl.dataset.num;
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
  const num = stickerEl.dataset.num;
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
  const modalImgUrl = stickerImageUrl(num, 400);
  const modalAvatar = modalImgUrl
    ? `<img src="${modalImgUrl}" alt="${sticker?.label || ''}" class="modal__header-photo" onerror="this.remove()">${avatarFallback(sticker, true)}`
    : avatarFallback(sticker, true);
  header.innerHTML = `
    <div class="modal__header-avatar" style="background:${color}">${modalAvatar}</div>
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
    document.querySelectorAll('.sticker').forEach(el => updateStickerEl(el, el.dataset.num));
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
    state = migrateAlbumData(decodeAlbumData(res.data));

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
  await loadImageMap();
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
