// Real AQARAK legal content — kept as structured data (not scattered inline
// JSX strings) so it's maintainable in one place per document.
//
// Every factual claim below was checked against the actual implementation
// (Supabase schema/RLS policies, Edge Functions, and the client code that
// calls them) before being written — see the AUDIT REPORT delivered
// alongside this file for the verified-fact list and the gaps that were
// deliberately left out rather than invented. Nothing here names a company
// legal entity, registration number, physical address, external contact
// email, or jurisdiction — none of those exist in this codebase, so none
// are stated. "Contact us" points at the real in-app Support ticket system
// (src/lib/account.ts → support_tickets), the only real contact channel
// that exists right now.

export type LegalSection = { heading: string; body: string; notice?: string };
export type LegalDocument = { title: string; updatedAt: string; sections: LegalSection[] };

export const TERMS: Record<'ar' | 'en', LegalDocument> = {
  ar: {
    title: 'الشروط والأحكام',
    updatedAt: '2026-09-16',
    sections: [
      {
        heading: '١. مقدمة',
        body: 'هذه الشروط تنظّم استخدامك لتطبيق عقارك. باستخدامك التطبيق — تصفحًا للإعلانات، إنشاء حساب، نشر إعلان، أو التواصل مع مستخدمين آخرين — فأنت توافق على الالتزام بها. إذا كنت لا توافق على أي بند منها، يرجى التوقف عن استخدام التطبيق.',
      },
      {
        heading: '٢. دور منصة عقارك',
        body: 'عقارك منصة إلكترونية تتيح لمستخدميها عرض العقارات (بيوت، شقق، وأراضٍ) للبيع أو الإيجار في سوريا، بما في ذلك عقارات متاحة للحجز قصير المدى، والتواصل المباشر بين الباحث عن عقار وصاحب الإعلان. عقارك وسيط تقني يربط المستخدمين ببعضهم، وليست طرفًا في أي عملية بيع أو إيجار أو حجز أو أي اتفاق مالي يتم بين المستخدمين.',
      },
      {
        heading: '٣. حسابات المستخدمين',
        body: 'يلزم إنشاء حساب موثّق برقم هاتف سوري أو بريد إلكتروني حقيقي مع رمز تحقق للاستخدام الكامل للتطبيق. أنت مسؤول عن صحة المعلومات التي تقدمها وعن الحفاظ على سرية بيانات الدخول الخاصة بحسابك. نشر إعلان عقاري يتطلب أيضًا توثيق هويتك من خلال قسم "توثيق الحساب" داخل التطبيق.',
      },
      {
        heading: '٤. إعلانات العقارات',
        body: 'يجب أن يكون كل إعلان حقيقيًا ودقيقًا: صور فعلية للعقار (٣ صور على الأقل)، سعر ومساحة وموقع صحيحين، ورقم تواصل فعّال. كل إعلان يمر بمراجعة من فريق عقارك قبل ظهوره للزوار، ولإدارة عقارك الحق برفض أو إزالة أي إعلان مخالف أو مضلل دون إشعار مسبق.',
      },
      {
        heading: '٥. دقة الإعلان والصلاحية القانونية',
        body: 'أنت وحدك المسؤول عن التأكد من أن لديك الحق القانوني في عرض العقار للبيع أو الإيجار أو الحجز. مراجعة عقارك للإعلانات قبل نشرها تتحقق من اكتمال المعلومات الأساسية (الصور، السعر، الموقع، الوصف)، ولا تشكّل تحققًا من ملكية العقار أو صحة مستنداته أو وضعه القانوني.',
        notice: 'عقارك لا تتحقق من ملكية العقار أو صحة السندات أو الوضع القانوني لأي عقار معروض. يُنصح دائمًا بمعاينة العقار والتحقق من الأوراق الرسمية بنفسك قبل إتمام أي صفقة.',
      },
      {
        heading: '٦. الحجوزات والمعاملات',
        body: 'يتيح عقارك حجز بعض العقارات لإقامة قصيرة المدى مباشرة داخل التطبيق. إرسال طلب حجز هو طلب يُرسَل إلى صاحب العقار، وتأكيده يعتمد على موافقته. عقارك لا يقوم بمعالجة أي دفعة مالية داخل التطبيق؛ أي اتفاق مالي يخص الحجز أو البيع أو الإيجار يتم مباشرة بين المستخدمين وخارج نطاق مسؤولية عقارك.',
      },
      {
        heading: '٧. التواصل بين المستخدمين',
        body: 'يوفر التطبيق قنوات للتواصل بين المستخدمين، منها المحادثة داخل التطبيق، أو فتح واتساب، أو الاتصال المباشر برقم المعلن. يُتوقع من المستخدمين التواصل باحترام وبنيّة حسنة، وعدم استخدام هذه القنوات لأي غرض مزعج أو احتيالي.',
      },
      {
        heading: '٨. النزاعات بين المستخدمين',
        body: 'عقارك ليست طرفًا في أي تعامل مباشر بين مستخدمين، ولا تتحمل — إلى الحد الذي يسمح به القانون المعمول به — مسؤولية أي خلاف أو ضرر ينشأ عن صفقة أو اتفاق أو حجز تم بين مستخدمين. في حال وجود نزاع، ننصح بالتواصل المباشر بين الطرفين ومعاينة العقار والتحقق من الأوراق الرسمية قبل أي التزام.',
      },
      {
        heading: '٩. الأنشطة المحظورة',
        body: 'يُمنع نشر معلومات كاذبة، أو انتحال صفة، أو نشر إعلان لعقار لا تملك صلاحية عرضه، أو استخدام التطبيق لأي غرض احتيالي أو غير قانوني أو مزعج لمستخدمين آخرين. مخالفة هذه الشروط قد تؤدي إلى إزالة المحتوى المخالف أو تقييد الوصول إلى حسابك.',
      },
      {
        heading: '١٠. محتوى المستخدمين',
        body: 'أنت المسؤول عن أي محتوى تنشره — الصور، النصوص، التقييمات، الرسائل. بنشرك محتوى عبر عقارك (كإعلان عقاري أو تقييم مستخدم)، فأنت تمنح عقارك ترخيصًا لعرض هذا المحتوى داخل التطبيق للزوار والمستخدمين الآخرين بالشكل الذي تعمل به الخدمة.',
      },
      {
        heading: '١١. الإبلاغ والمراجعة',
        body: 'يمكنك الإبلاغ عن إعلان أو مستخدم أو تقييم مخالف من داخل التطبيق. يراجع فريق عقارك البلاغات الواردة، وقد يتخذ إجراءً يشمل إزالة المحتوى المخالف بناءً على تقديره.',
      },
      {
        heading: '١٢. تعليق أو إنهاء الحساب',
        body: 'تحتفظ عقارك بالحق في رفض نشر أي إعلان، أو رفض طلب توثيق، أو تقييد أو إنهاء وصول أي حساب يخالف هذه الشروط بشكل جسيم أو متكرر، إلى الحد الذي يسمح به القانون المعمول به.',
      },
      {
        heading: '١٣. الملكية الفكرية',
        body: 'تصميم تطبيق عقارك وشعاره وواجهاته وعناصره التقنية مملوكة لعقارك. أنت تحتفظ بحقوقك على المحتوى الذي تنشره (كصور إعلاناتك)، مع الترخيص الممنوح لعقارك بعرضه كما هو موضح في البند ١٠.',
      },
      {
        heading: '١٤. توفر المنصة',
        body: 'نسعى لإبقاء عقارك متاحًا وقابلاً للاستخدام، لكننا لا نضمن — إلى الحد الذي يسمح به القانون المعمول به — استمرارية الخدمة دون انقطاع أو خلو التطبيق من الأخطاء التقنية في كل الأوقات.',
      },
      {
        heading: '١٥. إخلاء المسؤولية والقيود',
        body: 'عقارك لا تضمن دقة كل إعلان بشكل نهائي، ولا تتحمل — إلى الحد الذي يسمح به القانون المعمول به — مسؤولية أي خلاف أو ضرر أو خسارة ينشأ عن تعامل مباشر بين مستخدمين أو عن الاعتماد على معلومات إعلان لم تُتحقق ملكيته أو صحته القانونية من قِبل عقارك. يُنصح دائمًا بمعاينة العقار والتحقق من الأوراق الرسمية قبل إتمام أي صفقة.',
      },
      {
        heading: '١٦. التغييرات على الشروط',
        body: 'قد نُحدّث هذه الشروط من وقت لآخر. يعكس تاريخ "آخر تحديث" أعلى هذه الصفحة أحدث نسخة منها. استمرارك في استخدام التطبيق بعد نشر أي تحديث يعني موافقتك على الشروط المُحدّثة.',
      },
      {
        heading: '١٧. تواصل معنا',
        body: 'لأي استفسار أو مشكلة تخص حسابك أو إعلاناتك أو هذه الشروط، يمكنك التواصل معنا مباشرة من قسم "الدعم الفني" داخل التطبيق.',
      },
    ],
  },
  en: {
    title: 'Terms & Conditions',
    updatedAt: '2026-09-16',
    sections: [
      {
        heading: '1. Introduction',
        body: 'These Terms govern your use of the AQARAK app. By using the app — browsing listings, creating an account, posting a listing, or messaging other users — you agree to be bound by them. If you do not agree, please stop using the app.',
      },
      {
        heading: "2. AQARAK's Role",
        body: 'AQARAK is a platform that lets users list real properties (houses, apartments, and land) for sale or rent in Syria, including properties available for short-term booking, and connect directly with each other. AQARAK is a technical intermediary connecting users — not a party to any sale, rental, booking, or other financial arrangement between users.',
      },
      {
        heading: '3. User Accounts',
        body: 'Full use of the app requires a verified account with a real Syrian phone number or email address, confirmed by a verification code. You are responsible for the accuracy of the information you provide and for keeping your account credentials secure. Posting a property listing also requires verifying your identity through the "Account verification" section inside the app.',
      },
      {
        heading: '4. Property Listings',
        body: "Every listing must be real and accurate: genuine photos of the property (at least 3), a correct price, area, and location, and a working contact number. Every listing is reviewed by AQARAK's team before it becomes visible to visitors, and AQARAK may reject or remove any listing that is misleading or violates these Terms, without prior notice.",
      },
      {
        heading: '5. Listing Accuracy and Legal Authorization',
        body: "You alone are responsible for confirming you have the legal right to offer the property for sale, rent, or booking. AQARAK's pre-publish review checks that basic listing information is complete (photos, price, location, description) — it is not a verification of property ownership, title, or legal status.",
        notice: 'AQARAK does not verify property ownership, title documents, or the legal status of any listed property. Always inspect a property in person and verify official documents yourself before completing any transaction.',
      },
      {
        heading: '6. Bookings and Transactions',
        body: 'AQARAK lets some properties be booked for a short stay directly inside the app. Sending a booking request sends a request to the property owner; confirmation depends on their acceptance. AQARAK does not process any payment inside the app — any financial arrangement for a booking, sale, or rental happens directly between users and is outside AQARAK’s responsibility.',
      },
      {
        heading: '7. Communication Between Users',
        body: "The app provides ways for users to communicate, including in-app chat, opening WhatsApp, or calling the advertiser's number directly. Users are expected to communicate respectfully and in good faith, and not use these channels for harassment or fraud.",
      },
      {
        heading: '8. User-to-User Disputes',
        body: 'AQARAK is not a party to any direct dealing between users, and is not responsible — to the extent permitted by applicable law — for any dispute, loss, or damage arising from a transaction, agreement, or booking made between users. If a dispute arises, we recommend direct communication between the parties, inspecting the property in person, and verifying official documents before any commitment.',
      },
      {
        heading: '9. Prohibited Activities',
        body: "Posting false information, impersonation, listing a property you have no authority to offer, or using the app for any fraudulent, unlawful, or harassing purpose is prohibited. Violating these Terms may result in removal of the violating content or restricted access to your account.",
      },
      {
        heading: '10. User-Generated Content',
        body: 'You are responsible for any content you post — photos, text, reviews, messages. By posting content through AQARAK (such as a property listing or a user review), you grant AQARAK a license to display that content within the app to visitors and other users, as the service is designed to work.',
      },
      {
        heading: '11. Reporting and Moderation',
        body: "You can report a listing, a user, or a review from inside the app. AQARAK's team reviews submitted reports and may take action, including removing violating content, at its discretion.",
      },
      {
        heading: '12. Account Suspension or Termination',
        body: 'AQARAK reserves the right to reject a listing, reject a verification request, or restrict or terminate access for any account that seriously or repeatedly violates these Terms, to the extent permitted by applicable law.',
      },
      {
        heading: '13. Intellectual Property',
        body: "AQARAK's app design, name, and technical elements belong to AQARAK. You retain your rights to the content you post (such as your listing photos), subject to the license granted to AQARAK to display it as described in Section 10.",
      },
      {
        heading: '14. Platform Availability',
        body: 'We aim to keep AQARAK available and usable, but we do not guarantee — to the extent permitted by applicable law — uninterrupted service or that the app will be free of technical errors at all times.',
      },
      {
        heading: '15. Disclaimer and Limitations',
        body: "AQARAK cannot fully guarantee the accuracy of every listing, and is not responsible — to the extent permitted by applicable law — for any dispute, damage, or loss arising from direct dealings between users, or from relying on listing information whose ownership or legal accuracy AQARAK has not verified. Always inspect a property in person and verify official documents before completing any transaction.",
      },
      {
        heading: '16. Changes to the Terms',
        body: 'We may update these Terms from time to time. The "Last updated" date at the top of this page reflects the latest version. Continuing to use the app after an update is posted means you accept the updated Terms.',
      },
      {
        heading: '17. Contact Us',
        body: 'For any question or issue with your account, your listings, or these Terms, you can reach us directly through the "Support" section inside the app.',
      },
    ],
  },
};

export const PRIVACY: Record<'ar' | 'en', LegalDocument> = {
  ar: {
    title: 'سياسة الخصوصية',
    updatedAt: '2026-09-16',
    sections: [
      {
        heading: '١. مقدمة',
        body: 'توضح هذه السياسة ما هي البيانات التي يجمعها تطبيق عقارك، ولماذا، وكيف تُستخدم. هذه السياسة مكتوبة لتعكس ما يفعله التطبيق فعليًا اليوم، وليست نموذجًا عامًا.',
      },
      {
        heading: '٢. البيانات التي نجمعها',
        body: 'عند إنشاء حساب: الاسم الكامل، ورقم الهاتف أو البريد الإلكتروني، وكلمة المرور (في حال التسجيل بالبريد الإلكتروني، وتُدار بشكل آمن عبر مزوّد الخدمة Supabase ولا يطّلع عليها فريقنا). صورة الملف الشخصي إن أضفتها.\nعند نشر إعلان: الصور، الموقع، السعر، المساحة، الوصف، رقم التواصل، وأي مستند ملكية تختار إرفاقه.\nعند استخدامك ميزات أخرى: رسائل المحادثة داخل التطبيق، التقييمات التي تكتبها، البلاغات التي ترسلها، طلبات الحجز، والعقارات التي تحفظها في المفضلة. عند طلب توثيق الحساب: صورة وثيقة رسمية (هوية شخصية، جواز سفر، أو وثيقة إقامة) تُخزَّن في مساحة تخزين خاصة غير عامة.',
      },
      {
        heading: '٣. كيفية استخدام البيانات',
        body: 'تُستخدم بياناتك لإنشاء حسابك والتحقق منه، لعرض إعلاناتك المنشورة للزوار، لربطك بمن يتواصل معك بخصوص عقار، لإدارة حجوزاتك وتقييماتك ومفضلتك، ولمراجعة إعلاناتك وطلب توثيق حسابك قبل نشرها أو الموافقة عليها.',
      },
      {
        heading: '٤. مشاركة البيانات والإفصاح عنها',
        body: 'اسمك، صورتك، وإعلاناتك المنشورة تظهر للزوار بشكل علني — لأن كل إعلان بعقارك يجب أن يكون منسوبًا لصاحب حقيقي (لا إعلانات مجهولة). رقم هاتفك يظهر فقط إن اخترت إضافته كرقم تواصل على إعلان. نستعين بجهات خدمة تقنية لتشغيل التطبيق (مذكورة بالتفصيل في البند ١٢)، تصلها بياناتك بالقدر اللازم فقط لتقديم الميزة المرتبطة بها. لا نبيع بياناتك ولا نشاركها مع معلنين أو جهات تسويق.',
      },
      {
        heading: '٥. المحتوى الذي ينشئه المستخدم',
        body: 'أنت مسؤول عمّا تنشره من صور ونصوص وتقييمات ورسائل. تخضع الإعلانات لمراجعة من فريقنا قبل نشرها، وهي مراجعة للتأكد من اكتمال المعلومات الأساسية، وليست تحققًا من ملكية العقار أو صحته القانونية. أي محتوى تنشره بشكل علني (كالإعلانات والتقييمات) يكون مرئيًا لأي زائر للتطبيق.',
      },
      {
        heading: '٦. بيانات الموقع والخرائط',
        body: 'هناك نوعان من بيانات الموقع: موقع العقار الذي يحدده صاحب الإعلان ويُحفظ مع الإعلان ويظهر على الخريطة للجميع، وموقعك الشخصي الحي الذي يُطلب فقط عند ضغطك على "تحديد موقعي" على الخريطة أو عند طلبك معرفة المسافة إلى عقار معيّن. يُستخدم موقعك الشخصي لتحريك الخريطة أو حساب مسافة/زمن الطريق عبر خدمات خرائط خارجية (مذكورة في البند ١٢)، ولا يُخزَّن في قاعدة بياناتنا. تُعرض بلاطات الخريطة عبر خدمة Google Maps.',
      },
      {
        heading: '٧. الاتصالات والرسائل',
        body: 'رسائل المحادثة داخل التطبيق بين المشتري وصاحب الإعلان تُخزَّن في قاعدة بياناتنا، ولا يمكن الاطّلاع عليها إلا من طرفي المحادثة (مفروض ذلك بقواعد وصول صارمة على مستوى قاعدة البيانات). قد يعرض التطبيق أيضًا خيار فتح واتساب أو الاتصال المباشر برقم المعلن — وهذا يفتح تطبيق واتساب أو الهاتف الخاص بك مباشرة، ولا نطّلع على محتوى تلك المحادثة أو المكالمة ولا نخزّنه.',
      },
      {
        heading: '٨. الاحتفاظ بالبيانات',
        body: 'نحتفظ ببيانات حسابك طالما بقي حسابك قائمًا. لا توجد حاليًا لدى عقارك سياسة آلية لحذف البيانات تلقائيًا بعد مدة زمنية محددة؛ الطريقة الوحيدة لحذف بياناتك بشكل كامل هي حذف حسابك (البند ٩).',
      },
      {
        heading: '٩. حذف الحساب',
        body: 'يمكنك حذف حسابك في أي وقت من قسم "حسابي". حذف الحساب إجراء حقيقي ونهائي: يحذف ملفك الشخصي وكل ما يرتبط به مباشرة — إعلاناتك وصورها، محادثاتك، تقييماتك، بلاغاتك، مفضلتك، حجوزاتك، ووثيقة الهوية التي رفعتها للتوثيق. هذا الإجراء لا يمكن التراجع عنه.',
        notice: 'حذف الحساب نهائي ولا يمكن التراجع عنه بعد تنفيذه.',
      },
      {
        heading: '١٠. أمن وحماية البيانات',
        body: 'يُحفظ الوصول إلى بياناتك بقواعد وصول صارمة (Row Level Security) على مستوى قاعدة البيانات، بحيث لا يستطيع أي مستخدم أو زائر الاطّلاع على بيانات لا يُفترض أن يراها بحسب ما هو موضح في هذه السياسة (كرسائل محادثة لست طرفًا فيها، أو وثيقة توثيق مستخدم آخر).',
      },
      {
        heading: '١١. حقوق المستخدم',
        body: 'يمكنك عرض وتعديل بيانات ملفك الشخصي وإدارة إعلاناتك في أي وقت من داخل التطبيق. يمكنك طلب حذف حسابك وبياناتك بالكامل في أي وقت (البند ٩). لا يتوفر حاليًا خيار ذاتي لتصدير نسخة من بياناتك داخل التطبيق.',
      },
      {
        heading: '١٢. خدمات الجهات الخارجية',
        body: 'يعتمد عقارك على عدد من مزوّدي الخدمة لتشغيل ميزاته الفعلية: Supabase (الاستضافة، قاعدة البيانات، تسجيل الدخول، وتخزين الملفات)، خرائط Google (عرض الخريطة)، OpenStreetMap Nominatim (تحديد اسم العنوان من الموقع الجغرافي) وOSRM (حساب مسافة/زمن الطريق)، وResend (إرسال رمز التحقق عبر البريد الإلكتروني). تصل كل جهة إلى البيانات اللازمة فقط لتقديم وظيفتها كما هو موضح أعلاه.',
      },
      {
        heading: '١٣. خصوصية الأطفال',
        body: 'عقارك موجّه للاستخدام من قِبل البالغين القادرين على إبرام تعاملات عقارية. لا يتضمن التطبيق حاليًا آلية للتحقق من العمر.',
      },
      {
        heading: '١٤. التغييرات على سياسة الخصوصية',
        body: 'قد نُحدّث هذه السياسة من وقت لآخر. يعكس تاريخ "آخر تحديث" أعلى هذه الصفحة أحدث نسخة منها. استمرارك في استخدام التطبيق بعد نشر أي تحديث يعني موافقتك على السياسة المُحدّثة.',
      },
      {
        heading: '١٥. تواصل معنا',
        body: 'لأي استفسار يخص بياناتك أو هذه السياسة، يمكنك التواصل معنا مباشرة من قسم "الدعم الفني" داخل التطبيق.',
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updatedAt: '2026-09-16',
    sections: [
      {
        heading: '1. Introduction',
        body: 'This policy explains what data the AQARAK app collects, why, and how it is used. It is written to reflect what the app actually does today, not a generic template.',
      },
      {
        heading: '2. Information We Collect',
        body: "When you create an account: your full name, phone number or email, and a password (for email sign-up, securely managed by our service provider Supabase — our team cannot see it). A profile photo, if you add one.\nWhen you post a listing: photos, location, price, area, description, contact number, and any ownership document you choose to attach.\nWhen you use other features: in-app chat messages, reviews you write, reports you submit, booking requests, and properties you save to favorites. When you request account verification: a photo of an official document (national ID, passport, or residence document), stored in a private, non-public storage area.",
      },
      {
        heading: '3. How We Use Information',
        body: "Your data is used to create and verify your account, to show your published listings to visitors, to connect you with people reaching out about a property, to manage your bookings, reviews, and favorites, and to review your listings and verification requests before they're published or approved.",
      },
      {
        heading: '4. Sharing and Disclosure',
        body: "Your name, photo, and published listings are shown publicly to visitors — every listing on AQARAK must be attributed to a real advertiser, never anonymous. Your phone number is shown only if you choose to add it as the contact number on a listing. We use technical service providers to run the app (listed in detail in Section 12), who receive only the data needed to provide their specific function. We do not sell your data or share it with advertisers or marketers.",
      },
      {
        heading: '5. User-Generated Content',
        body: 'You are responsible for the photos, text, reviews, and messages you post. Listings go through review by our team before publishing — a check that basic information is complete, not a verification of the property\'s ownership or legal accuracy. Anything you post publicly (like a listing or a review) is visible to any visitor of the app.',
      },
      {
        heading: '6. Location and Map Data',
        body: 'There are two kinds of location data: a listing\'s location, set by whoever posts it, saved with the listing, and shown on the map to everyone; and your own live location, only requested when you tap "locate me" on the map or ask for the distance to a specific listing. Your live location is used to move the map or calculate a route/time via external mapping services (listed in Section 12), and is not stored in our database. Map tiles are provided by Google Maps.',
      },
      {
        heading: '7. Communications and Messages',
        body: "In-app chat messages between a buyer and a listing owner are stored in our database and can only be read by the two participants (enforced by strict database-level access rules). The app may also offer a WhatsApp or direct call option to the advertiser's number — this opens your own WhatsApp or Phone app directly, and we do not see or store anything from that conversation or call.",
      },
      {
        heading: '8. Data Retention',
        body: "We keep your account data for as long as your account exists. AQARAK does not currently have an automatic policy that deletes data after a fixed period; the only way to fully delete your data is to delete your account (Section 9).",
      },
      {
        heading: '9. Account Deletion',
        body: 'You can delete your account at any time from the "Account" section. Deleting your account is real and permanent: it deletes your profile and everything directly tied to it — your listings and their photos, your chats, reviews, reports, favorites, bookings, and any identity document you uploaded for verification. This action cannot be undone.',
        notice: 'Account deletion is permanent and cannot be undone once carried out.',
      },
      {
        heading: '10. Data Security',
        body: 'Access to your data is restricted by strict, database-level access rules (Row Level Security), so no user or visitor can read data they are not meant to see under this policy — such as chat messages you are not part of, or another user’s verification document.',
      },
      {
        heading: '11. User Rights',
        body: 'You can view and edit your profile information and manage your listings at any time from inside the app. You can request full deletion of your account and data at any time (Section 9). A self-service option to export a copy of your data is not currently available in the app.',
      },
      {
        heading: '12. Third-Party Services',
        body: 'AQARAK relies on a number of service providers to run its actual features: Supabase (hosting, database, authentication, and file storage), Google Maps (map display), OpenStreetMap Nominatim (turning a location into an address) and OSRM (driving distance/time estimates), and Resend (delivering the email verification code). Each provider receives only the data needed to perform the function described above.',
      },
      {
        heading: "13. Children's Privacy",
        body: 'AQARAK is intended for use by adults capable of entering into real-estate transactions. The app does not currently include an age-verification mechanism.',
      },
      {
        heading: '14. Changes to This Privacy Policy',
        body: 'We may update this policy from time to time. The "Last updated" date at the top of this page reflects the latest version. Continuing to use the app after an update is posted means you accept the updated policy.',
      },
      {
        heading: '15. Contact Us',
        body: 'For any question about your data or this policy, you can reach us directly through the "Support" section inside the app.',
      },
    ],
  },
};
