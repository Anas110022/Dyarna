// Real Dyarna legal content — kept as structured data (not scattered inline
// JSX strings) so it's maintainable in one place per document. Genuine,
// Dyarna-specific text describing how this app actually works today
// (real Supabase auth, real admin review before a listing publishes, real
// photo/ownership requirements) — not placeholder/lorem-ipsum filler.

export type LegalSection = { heading: string; body: string };
export type LegalDocument = { title: string; updatedAt: string; sections: LegalSection[] };

export const TERMS: Record<'ar' | 'en', LegalDocument> = {
  ar: {
    title: 'الشروط والأحكام',
    updatedAt: '2026-09-03',
    sections: [
      {
        heading: '١. عن ديارنا',
        body: 'ديارنا منصة إلكترونية تتيح لمستخدميها عرض العقارات (بيوت، شقق، وأراضٍ) للبيع أو الإيجار في سوريا، والتواصل المباشر بين الباحث عن عقار وصاحب الإعلان. ديارنا وسيط تقني، وليست طرفًا في أي عملية بيع أو إيجار تتم بين المستخدمين.',
      },
      {
        heading: '٢. حسابك',
        body: 'يلزم إنشاء حساب موثّق برقم هاتف سوري أو بريد إلكتروني حقيقي مع رمز تحقق للاستخدام الكامل للتطبيق. أنت مسؤول عن صحة المعلومات التي تقدمها وعن الحفاظ على سرية بيانات الدخول الخاصة بحسابك.',
      },
      {
        heading: '٣. نشر الإعلانات',
        body: 'يجب أن يكون كل إعلان حقيقيًا ودقيقًا: صور فعلية للعقار (٣ صور على الأقل)، سعر ومساحة وموقع صحيحين، ورقم تواصل فعّال. كل إعلان يمر بمراجعة قبل ظهوره للزوار، ولإدارة ديارنا الحق برفض أو إزالة أي إعلان مخالف أو مضلل دون إشعار مسبق.',
      },
      {
        heading: '٤. سلوك المستخدمين',
        body: 'يُمنع نشر معلومات كاذبة، أو انتحال صفة، أو استخدام التطبيق لأي غرض احتيالي أو غير قانوني. ديارنا قد تعلّق أو تحذف أي حساب يخالف هذه الشروط.',
      },
      {
        heading: '٥. حدود المسؤولية',
        body: 'ديارنا لا تضمن دقة كل إعلان بشكل نهائي ولا تتحمل مسؤولية أي خلاف أو ضرر ينشأ عن تعامل مباشر بين مستخدمين. يُنصح دائمًا بمعاينة العقار والتحقق من الأوراق الرسمية قبل إتمام أي صفقة.',
      },
      {
        heading: '٦. التواصل والدعم',
        body: 'لأي استفسار أو مشكلة تخص حسابك أو إعلاناتك، يمكنك التواصل معنا مباشرة من قسم "الدعم الفني" داخل التطبيق.',
      },
    ],
  },
  en: {
    title: 'Terms & Conditions',
    updatedAt: '2026-09-03',
    sections: [
      {
        heading: '1. About Dyarna',
        body: 'Dyarna is a platform that lets users list real properties (houses, apartments, and land) for sale or rent in Syria, and connect directly with each other. Dyarna is a technical intermediary — not a party to any sale or rental transaction between users.',
      },
      {
        heading: '2. Your account',
        body: 'Full use of the app requires a verified account with a real Syrian phone number or email address, confirmed by a verification code. You are responsible for the accuracy of the information you provide and for keeping your account credentials secure.',
      },
      {
        heading: '3. Posting listings',
        body: 'Every listing must be real and accurate: genuine photos of the property (at least 3), a correct price, area, and location, and a working contact number. Every listing is reviewed before it becomes visible to visitors, and Dyarna may reject or remove any listing that is misleading or violates these terms, without prior notice.',
      },
      {
        heading: '4. User conduct',
        body: 'Posting false information, impersonation, or using the app for any fraudulent or unlawful purpose is prohibited. Dyarna may suspend or remove any account that violates these terms.',
      },
      {
        heading: '5. Limitation of liability',
        body: "Dyarna cannot fully guarantee the accuracy of every listing and is not responsible for disputes or damages arising from direct dealings between users. Always inspect a property in person and verify official documents before completing any transaction.",
      },
      {
        heading: '6. Contact & support',
        body: 'For any question or issue with your account or listings, you can reach us directly through the "Support" section inside the app.',
      },
    ],
  },
};

export const PRIVACY: Record<'ar' | 'en', LegalDocument> = {
  ar: {
    title: 'سياسة الخصوصية',
    updatedAt: '2026-09-03',
    sections: [
      {
        heading: '١. البيانات التي نجمعها',
        body: 'نجمع فقط ما تحتاجه المنصة لتعمل بشكل صحيح: الاسم الكامل، رقم الهاتف و/أو البريد الإلكتروني، صورة الملف الشخصي إن أضفتها، وبيانات أي إعلان تنشره (الصور، الموقع، السعر، التفاصيل).',
      },
      {
        heading: '٢. كيف نستخدم بياناتك',
        body: 'تُستخدم بياناتك لإنشاء حسابك والتحقق منه، لعرض إعلاناتك المنشورة للزوار، ولربطك بمن يتواصل معك بخصوص عقار. لا نبيع بياناتك لأي طرف ثالث.',
      },
      {
        heading: '٣. أين تُخزَّن بياناتك',
        body: 'تُخزَّن بيانات ديارنا وصورها على منصة Supabase، وهي جهة استضافة وقواعد بيانات تعمل كمعالج بيانات لحسابنا وفق ضوابط وصول صارمة (Row Level Security) تمنع أي مستخدم من الوصول لبيانات مستخدم آخر لا يفترض أن يراها.',
      },
      {
        heading: '٤. ظهور بياناتك للآخرين',
        body: 'اسمك، صورتك، وإعلاناتك المنشورة تظهر للزوار بشكل علني — لأن كل إعلان بديارنا يجب أن يكون منسوبًا لصاحب حقيقي (لا إعلانات مجهولة). رقم هاتفك يظهر فقط إن اخترت إضافته كرقم تواصل على إعلان.',
      },
      {
        heading: '٥. حذف حسابك',
        body: 'يمكنك التواصل معنا عبر قسم "الدعم الفني" لطلب حذف حسابك وبياناتك.',
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updatedAt: '2026-09-03',
    sections: [
      {
        heading: '1. Data we collect',
        body: "We only collect what the platform genuinely needs to function: your full name, phone number and/or email, a profile photo if you add one, and the data of any listing you post (photos, location, price, details).",
      },
      {
        heading: '2. How we use your data',
        body: 'Your data is used to create and verify your account, to show your published listings to visitors, and to connect you with people reaching out about a property. We do not sell your data to any third party.',
      },
      {
        heading: '3. Where your data is stored',
        body: 'Dyarna’s data and images are stored on Supabase, a hosting and database provider acting as a data processor for us, under strict access controls (Row Level Security) that prevent any user from accessing another user’s data they are not meant to see.',
      },
      {
        heading: '4. What others can see',
        body: "Your name, photo, and published listings are shown publicly to visitors — every listing on Dyarna must be attributed to a real advertiser, never anonymous. Your phone number is shown only if you choose to add it as the contact number on a listing.",
      },
      {
        heading: '5. Deleting your account',
        body: 'You can contact us through the "Support" section to request deletion of your account and data.',
      },
    ],
  },
};
