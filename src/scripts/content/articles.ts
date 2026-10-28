export type ArticleBlockSeed =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

export interface ArticleSeed {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  blocks: ArticleBlockSeed[];
}

export const ARTICLE_SEEDS: ArticleSeed[] = [
  {
    slug: 'mengenal-tes-disc-empat-gaya-kerja',
    title: 'Mengenal Tes DISC: Empat Gaya Kerja dan Cara Membacanya',
    excerpt:
      'DISC bukan tes kecerdasan dan bukan diagnosis. Ia memetakan kecenderungan cara Anda merespons tugas, orang, dan aturan — berikut cara membaca hasilnya tanpa salah tafsir.',
    category: 'Tes & Asesmen',
    blocks: [
      {
        type: 'heading',
        text: 'Apa yang sebenarnya diukur DISC',
      },
      {
        type: 'paragraph',
        text: 'DISC adalah alat pemetaan preferensi perilaku yang populer di dunia kerja. Ia tidak mengukur seberapa pintar seseorang, melainkan bagaimana seseorang cenderung bersikap ketika menghadapi tugas, berinteraksi dengan orang lain, dan merespons aturan. Karena sifatnya preferensi, hasil DISC bisa terlihat berbeda ketika Anda sedang lelah, di bawah tekanan, atau berada di lingkungan yang baru.',
      },
      {
        type: 'heading',
        text: 'Empat dimensi, empat kecenderungan',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Dominance (D): dorongan untuk mengambil kendali, bergerak cepat, dan mengejar hasil.',
          'Influence (I): dorongan untuk berinteraksi, meyakinkan, dan membangun suasana.',
          'Steadiness (S): dorongan untuk menjaga kestabilan, mendukung tim, dan bekerja dengan ritme yang tenang.',
          'Conscientiousness (C): dorongan untuk teliti, terstruktur, dan berpegang pada standar.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Hampir semua orang memiliki keempatnya dalam kadar berbeda. Yang muncul sebagai gaya utama biasanya adalah kombinasi dua dimensi yang paling sering dipakai sehari-hari.',
      },
      {
        type: 'heading',
        text: 'Tiga kesalahan umum saat membaca hasil',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Menganggap hasil sebagai label permanen. DISC menggambarkan kecenderungan, bukan batas kemampuan.',
          'Menilai satu gaya lebih baik dari yang lain. Setiap gaya punya kekuatan dan titik lemahnya sendiri; yang menentukan adalah kesesuaian dengan tuntutan peran.',
          'Memakai hasil sebagai satu-satunya penentu dalam rekrutmen. DISC lebih tepat menjadi bahan diskusi daripada alat saring tunggal.',
        ],
      },
      {
        type: 'heading',
        text: 'Membaca hasil dengan lebih jujur',
      },
      {
        type: 'paragraph',
        text: 'Cara paling sehat adalah membandingkan hasil dengan pengalaman nyata: pada situasi apa Anda merasa paling produktif, kapan Anda paling cepat lelah, dan umpan balik apa yang paling sering Anda terima dari rekan kerja. Hasil tes menjadi cermin awal, bukan kesimpulan akhir.',
      },
      {
        type: 'heading',
        text: 'Untuk tim dan atasan',
      },
      {
        type: 'paragraph',
        text: 'Ketika satu tim memahami profil satu sama lain, percakapan soal cara kerja menjadi lebih netral. Alih-alih "kamu terlalu lambat", tim bisa membahas "kita butuh satu orang yang memeriksa detail sebelum dikirim". Perbedaan gaya berubah dari sumber gesekan menjadi pembagian peran.',
      },
      {
        type: 'paragraph',
        text: 'Jika ingin mencoba, kerjakan tes dalam kondisi tenang dan jawab sesuai kebiasaan Anda, bukan sesuai citra yang ingin ditampilkan. Hasil yang jujur selalu lebih berguna, meskipun tidak selalu terdengar keren.',
      },
    ],
  },
  {
    slug: 'stres-kerja-kapan-masih-wajar-dan-kapan-perlu-bantuan',
    title: 'Stres Kerja: Kapan Masih Wajar dan Kapan Perlu Bantuan',
    excerpt:
      'Stres pada kadar tertentu membantu kita menyelesaikan pekerjaan. Masalah muncul ketika tubuh tidak lagi punya waktu untuk pulih — ini tanda-tandanya.',
    category: 'Kesehatan Mental',
    blocks: [
      {
        type: 'heading',
        text: 'Stres tidak selalu musuh',
      },
      {
        type: 'paragraph',
        text: 'Tekanan menjelang tenggat bisa membuat kita fokus. Tubuh merespons dengan mempercepat detak jantung, menajamkan perhatian, dan mengalihkan energi ke hal yang mendesak. Selama periode tekanan itu pendek dan diikuti waktu pulih, tubuh mampu kembali seimbang.',
      },
      {
        type: 'heading',
        text: 'Ketika pemulihan tidak pernah datang',
      },
      {
        type: 'paragraph',
        text: 'Masalah mulai muncul ketika tekanan berlangsung terus-menerus tanpa jeda. Tubuh tetap berada dalam mode siaga, dan biayanya terasa: tidur terganggu, mudah tersinggung, sulit berkonsentrasi, dan pekerjaan yang biasanya cepat selesai terasa berat.',
      },
      {
        type: 'heading',
        text: 'Tanda yang perlu diperhatikan',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Fisik: sakit kepala berulang, tegang di leher dan bahu, gangguan tidur, atau keluhan lambung yang muncul saat beban kerja meningkat.',
          'Emosi: mudah marah, cemas tanpa sebab jelas, atau kehilangan minat pada hal yang biasanya menyenangkan.',
          'Perilaku: menunda pekerjaan penting, menarik diri dari rekan kerja, atau menambah konsumsi kafein dan rokok untuk bertahan.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Tanda-tanda ini tidak otomatis berarti ada gangguan kesehatan mental. Namun bila berlangsung berminggu-minggu dan mulai mengganggu fungsi sehari-hari, itu isyarat bahwa Anda perlu mencari dukungan.',
      },
      {
        type: 'heading',
        text: 'Kapan mencari bantuan profesional',
      },
      {
        type: 'paragraph',
        text: 'Pertimbangkan berbicara dengan psikolog atau tenaga kesehatan ketika keluhan sudah mengganggu tidur, nafsu makan, hubungan, atau kemampuan menyelesaikan pekerjaan dasar; ketika Anda merasa tidak punya tempat untuk bercerita; atau ketika muncul pikiran untuk menyakiti diri. Kondisi terakhir bukan sesuatu yang perlu ditunda.',
      },
      {
        type: 'heading',
        text: 'Langkah kecil yang bisa dicoba lebih dulu',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Pisahkan waktu kerja dan waktu pulih secara jelas, termasuk mematikan notifikasi di luar jam kerja.',
          'Turunkan standar pada hal yang tidak krusial selama periode sibuk, bukan pada semuanya sekaligus.',
          'Bicarakan beban kerja dengan atasan memakai data: daftar tugas, tenggat, dan mana yang bisa digeser.',
          'Jaga dasar-dasar: tidur cukup, makan teratur, dan bergerak setiap hari, sekecil apa pun.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Artikel ini bersifat edukatif dan bukan pengganti diagnosis. Jika keluhan terasa berat, konsultasikan dengan profesional yang memahami kondisi Anda secara utuh.',
      },
    ],
  },
  {
    slug: 'memilih-jurusan-atau-karier-mulai-dari-minat',
    title: 'Memilih Jurusan atau Karier: Mulai dari Minat, Bukan Tren',
    excerpt:
      'Tren jurusan berubah tiap beberapa tahun, sementara cara Anda bekerja cenderung lebih stabil. Tiga pertanyaan ini lebih berguna daripada daftar jurusan paling dicari.',
    category: 'Karier & Pendidikan',
    blocks: [
      {
        type: 'heading',
        text: 'Kenapa tren bukan penentu utama',
      },
      {
        type: 'paragraph',
        text: 'Setiap beberapa tahun muncul daftar jurusan atau profesi yang disebut paling menjanjikan. Sebagian benar, sebagian hanya ramai di media sosial. Masalahnya, keputusan jurusan biasanya mengikat empat tahun ke depan, sementara tren bisa berbalik jauh lebih cepat.',
      },
      {
        type: 'heading',
        text: 'Tiga pertanyaan yang lebih berguna',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Kegiatan apa yang membuat saya betah berlama-lama, bahkan ketika tidak diminta?',
          'Masalah seperti apa yang membuat saya ingin ikut mencari solusinya?',
          'Lingkungan kerja seperti apa yang membuat saya bekerja paling baik: banyak interaksi, banyak analisis, atau campuran keduanya?',
        ],
      },
      {
        type: 'paragraph',
        text: 'Jawaban atas tiga pertanyaan ini jarang berupa satu kata. Tapi pola yang muncul biasanya lebih jujur daripada daftar jurusan favorit.',
      },
      {
        type: 'heading',
        text: 'Minat, bakat, dan nilai tidak selalu sejalan',
      },
      {
        type: 'paragraph',
        text: 'Minat menjelaskan apa yang Anda nikmati. Bakat menjelaskan apa yang lebih cepat Anda kuasai. Nilai menjelaskan apa yang penting bagi Anda, misalnya stabilitas, dampak sosial, atau kebebasan. Karier yang bertahan lama biasanya merupakan irisan ketiganya, bukan hanya salah satunya.',
      },
      {
        type: 'heading',
        text: 'Sampai mana tes minat membantu',
      },
      {
        type: 'paragraph',
        text: 'Tes minat dan tes kepribadian bisa mempersempit pilihan, tetapi tidak bisa memilih untuk Anda. Gunanya adalah menyediakan bahasa untuk menjelaskan kecenderungan Anda, sehingga diskusi dengan orang tua, guru, atau pembimbing menjadi lebih terarah.',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Gunakan hasil tes sebagai daftar hipotesis, bukan keputusan akhir.',
          'Uji hipotesis itu lewat pengalaman kecil: proyek, magang, organisasi, atau kursus pendek.',
          'Beri waktu. Rasa cocok biasanya muncul setelah cukup lama mencoba, bukan dari satu kali membaca deskripsi.',
        ],
      },
      {
        type: 'heading',
        text: 'Penutup',
      },
      {
        type: 'paragraph',
        text: 'Tidak ada satu jurusan yang menjamin karier, dan tidak ada satu pilihan yang menutup semua pintu. Yang paling menentukan adalah seberapa sering Anda menguji pilihan dengan pengalaman nyata, dan seberapa jujur Anda membaca apa yang membuat Anda bertahan.',
      },
    ],
  },
];
