/**
 * i18n.js — Multilingual strings for Citizen Service Assistant
 * Languages: English (en), Hindi (hi), Telugu (te)
 */
const I18N = {
  en: {
    /* Header */
    header_subtitle:"Government of India · Digital Citizen Services",
    header_title:"Citizen Service Assistant",
    header_tagline:"Your AI-powered guide to government services — available 24×7",
    /* Analytics */
    stat_queries:"Queries Answered",stat_resolution:"Resolution Rate",
    stat_response:"Avg Response",stat_langs:"Languages Served",
    /* Services */
    services_heading:"How can we help you today?",
    /* Tiles */
    tile_birth_label:"Birth Certificate",tile_birth_sub:"Application, documents & status",
    tile_ration_label:"Ration Card",tile_ration_sub:"BPL, PHH, AAY card details",
    tile_pension_label:"Pension Schemes",tile_pension_sub:"IGNOAPS & IGNWPS details",
    tile_tax_label:"Income Tax",tile_tax_sub:"ITR filing, slabs & rebates",
    tile_elig_label:"Check My Eligibility",tile_elig_sub:"Find schemes you qualify for",
    tile_docs_btn:"📄 Documents",tile_apply_btn:"🌐 Apply Online",
    tile_itr_btn:"🌐 File ITR",tile_criteria_btn:"📋 All Criteria",
    /* Chat */
    bot_name:"Citizen Service Bot",bot_status:"Online",
    clear_chat:"Clear Chat",live_agent_btn:"👤 Live Agent",
    chat_placeholder:"Type your question or speak using the mic… (English, हिन्दी, తెలుగు)",
    confidence_label:"Response confidence:",
    /* Eligibility panel */
    eligibility_title:"🎯 Eligibility Checker",
    eligibility_intro:"Enter your details below. We evaluate your profile against all available schemes and show exactly what you qualify for.",
    form_sec_identity:"🪪 Identity Details",form_sec_personal:"📋 Personal Details",form_sec_location:"📍 Location & Financial",
    label_full_name:"Full Name",label_aadhaar_name:"Name as per Aadhaar",label_pan_name:"Name as per PAN",
    label_dob:"Date of Birth",label_age:"Age (years)",label_gender:"Gender",
    label_marital:"Marital Status",label_state:"State",label_district:"District",
    label_income:"Annual Household Income (₹)",label_category:"Social Category",
    hint_name_pan:"We'll check for name format differences",
    hint_age:"Your current age",hint_marital:"Required for Widow Pension",hint_income:"Leave blank if unknown",
    opt_not_specified:"— Not specified —",opt_select_state:"— Select State —",
    opt_female:"Female",opt_male:"Male",opt_other:"Other",
    opt_married:"Married",opt_widowed:"Widowed",opt_single:"Single / Unmarried",opt_divorced:"Divorced / Separated",
    opt_sc:"SC (Scheduled Caste)",opt_st:"ST (Scheduled Tribe)",opt_obc:"OBC (Other Backward Class)",opt_general:"General",
    eligibility_submit:"Check All Schemes →",eligibility_loading:"Evaluating…",close_eligibility:"✕",
    /* Live agent */
    live_agent_title:"💬 Connect to Live Agent",
    live_agent_intro:"Please provide your contact details so a support agent can assist you.",
    label_your_name:"Your Name",label_email:"Email Address",label_issue:"Describe your issue",
    ph_full_name:"Full name",ph_email:"your@email.com",ph_issue:"What do you need help with?",
    btn_connect_agent:"Connect to Agent →",btn_cancel:"Cancel",
    ticket_created_h:"Support Ticket Created",ticket_agent_msg:"A live agent will be connected shortly.",
    ph_live_msg:"Type your message…",btn_send:"Send",typing_badge:"Agent is typing…",
    /* Mismatch */
    mismatch_title:"⚠️ Potential Name Difference Detected",
    mismatch_dismiss:"I understand, continue",mismatch_guide_btn:"Check Official Guidance",
    /* Redirect */
    redirect_title:"🌐 You're Leaving This Application",
    redirect_intro:"You're about to continue your application on the official government website.",
    redirect_sub:"Before proceeding, please ensure the following documents are ready:",
    redirect_warning:"⚠️ Please verify that your personal information matches your official documents before continuing.",
    redirect_source:"Redirecting to an official government portal (.gov.in)",
    redirect_cancel:"Cancel",redirect_confirm:"Continue to Official Website →",
    /* Docs modal */
    docs_modal_title:"Documents Required",docs_modal_sub:"Official checklist of documents to keep ready",
    /* Footer */
    footer_portals_title:"🏛️ Official Government Portals",
    disclaimer:"⚠️ Disclaimer: AI-generated responses are for informational purposes only. Always verify critical information with official government sources before taking action. This service does not constitute legal or financial advice.",
    agent_portal_link:"Agent Portal",portal_label:"🔗 Official Portals:",
    /* Welcome message (array joined with \n) */
    welcome:[
      "🙏 **Namaste!** Welcome to the Government of India Citizen Service Assistant.",
      "","I can help you with:",
      "• Birth certificates, ration cards, pension schemes",
      "• Income tax filing, rebates, and refunds",
      "• Checking your eligibility for government welfare schemes",
      "• Application rejection reasons and appeals",
      "","You may type in **English, हिन्दी, or తెలుగు**. Use the 🎤 mic button for voice input.",
      "","**How can I assist you today?**"
    ]
  },

  hi: {
    header_subtitle:"भारत सरकार · डिजिटल नागरिक सेवाएं",
    header_title:"नागरिक सेवा सहायक",
    header_tagline:"AI-संचालित सरकारी सेवा मार्गदर्शक — 24×7 उपलब्ध",
    stat_queries:"उत्तर दिए गए प्रश्न",stat_resolution:"समाधान दर",
    stat_response:"औसत उत्तर समय",stat_langs:"भाषाएं सेवित",
    services_heading:"आज हम आपकी कैसे मदद कर सकते हैं?",
    tile_birth_label:"जन्म प्रमाण पत्र",tile_birth_sub:"आवेदन, दस्तावेज़ और स्थिति",
    tile_ration_label:"राशन कार्ड",tile_ration_sub:"BPL, PHH, AAY कार्ड विवरण",
    tile_pension_label:"पेंशन योजनाएं",tile_pension_sub:"IGNOAPS और IGNWPS विवरण",
    tile_tax_label:"आयकर",tile_tax_sub:"ITR दाखिल, स्लैब और छूट",
    tile_elig_label:"मेरी पात्रता जांचें",tile_elig_sub:"वे योजनाएं खोजें जिनके आप पात्र हैं",
    tile_docs_btn:"📄 दस्तावेज़",tile_apply_btn:"🌐 ऑनलाइन आवेदन करें",
    tile_itr_btn:"🌐 ITR दाखिल करें",tile_criteria_btn:"📋 सभी मानदंड",
    bot_name:"नागरिक सेवा बॉट",bot_status:"ऑनलाइन",
    clear_chat:"चैट साफ करें",live_agent_btn:"👤 लाइव एजेंट",
    chat_placeholder:"अपना प्रश्न लिखें या माइक से बोलें… (English, हिन्दी, తెలుగు)",
    confidence_label:"उत्तर विश्वास:",
    eligibility_title:"🎯 पात्रता जांचकर्ता",
    eligibility_intro:"नीचे अपना विवरण दर्ज करें। हम सभी योजनाओं के विरुद्ध आपकी प्रोफ़ाइल का मूल्यांकन करते हैं।",
    form_sec_identity:"🪪 पहचान विवरण",form_sec_personal:"📋 व्यक्तिगत विवरण",form_sec_location:"📍 स्थान और वित्त",
    label_full_name:"पूरा नाम",label_aadhaar_name:"आधार अनुसार नाम",label_pan_name:"PAN अनुसार नाम",
    label_dob:"जन्म तिथि",label_age:"आयु (वर्ष)",label_gender:"लिंग",
    label_marital:"वैवाहिक स्थिति",label_state:"राज्य",label_district:"जिला",
    label_income:"वार्षिक घरेलू आय (₹)",label_category:"सामाजिक श्रेणी",
    hint_name_pan:"हम नाम के अंतर की जांच करेंगे",hint_age:"आपकी वर्तमान आयु",
    hint_marital:"विधवा पेंशन के लिए आवश्यक",hint_income:"यदि ज्ञात न हो तो खाली छोड़ें",
    opt_not_specified:"— निर्दिष्ट नहीं —",opt_select_state:"— राज्य चुनें —",
    opt_female:"महिला",opt_male:"पुरुष",opt_other:"अन्य",
    opt_married:"विवाहित",opt_widowed:"विधवा",opt_single:"अविवाहित",opt_divorced:"तलाकशुदा / अलग",
    opt_sc:"SC (अनुसूचित जाति)",opt_st:"ST (अनुसूचित जनजाति)",opt_obc:"OBC (अन्य पिछड़ा वर्ग)",opt_general:"सामान्य",
    eligibility_submit:"सभी योजनाएं जांचें →",eligibility_loading:"मूल्यांकन हो रहा है…",close_eligibility:"✕",
    live_agent_title:"💬 लाइव एजेंट से जुड़ें",
    live_agent_intro:"कृपया अपना विवरण दें ताकि एजेंट आपकी सहायता कर सके।",
    label_your_name:"आपका नाम",label_email:"ईमेल पता",label_issue:"समस्या बताएं",
    ph_full_name:"पूरा नाम",ph_email:"aapka@email.com",ph_issue:"आपको किस में सहायता चाहिए?",
    btn_connect_agent:"एजेंट से जुड़ें →",btn_cancel:"रद्द करें",
    ticket_created_h:"सहायता टिकट बनाया गया",ticket_agent_msg:"एक एजेंट जल्द ही जुड़ेगा।",
    ph_live_msg:"अपना संदेश लिखें…",btn_send:"भेजें",typing_badge:"एजेंट टाइप कर रहा है…",
    mismatch_title:"⚠️ नाम अंतर संभावित",mismatch_dismiss:"मैं समझता/समझती हूं, जारी रखें",mismatch_guide_btn:"अधिकारिक मार्गदर्शन",
    redirect_title:"🌐 आप ऐप से बाहर जा रहे हैं",
    redirect_intro:"आप अधिकारिक सरकारी वेबसाइट पर आवेदन जारी रखने वाले हैं।",
    redirect_sub:"आगे बढ़ने से पहले सुनिश्चित करें कि निम्नलिखित दस्तावेज तैयार हैं:",
    redirect_warning:"⚠️ आगे बढ़ने से पहले सुनिश्चित करें कि आपकी व्यक्तिगत जानकारी अधिकारिक दस्तावेजों से मेल खाती है।",
    redirect_source:"अधिकारिक .gov.in पोर्टल पर रीडायरेक्ट हो रहा है",
    redirect_cancel:"रद्द करें",redirect_confirm:"अधिकारिक वेबसाइट जारी रखें →",
    docs_modal_title:"आवश्यक दस्तावेज़",docs_modal_sub:"आवेदन के लिए आवश्यक दस्तावेजों की सूची",
    footer_portals_title:"🏛️ अधिकारिक सरकारी पोर्टल",
    disclaimer:"⚠️ अस्वीकृति: AI-जनित उत्तर केवल सूचना के उद्देश्य से हैं। कार्य करने से पहले हमेशा अधिकारिक स्रोतों से सत्यापित करें।",
    agent_portal_link:"एजेंट पोर्टल",portal_label:"🔗 अधिकारिक पोर्टल:",
    welcome:[
      "🙏 **नमस्ते!** भारत सरकार नागरिक सेवा सहायक में आपका स्वागत है।",
      "","मैं आपकी सहायता कर सकता/सकती हूं:",
      "• जन्म प्रमाण पत्र, राशन कार्ड, पेंशन योजनाएं",
      "• आयकर दाखिल, छूट और रिफंड",
      "• सरकारी कल्याण योजनाओं के लिए पात्रता जांच",
      "• आवेदन अस्वीकृति कारण और अपील",
      "","**English, हिन्दी, या తెలుగు** में लिखें। आवाज इनपुट के लिए 🎤 माइक बटन दबाएं।",
      "","**आज मैं आपकी कैसे सहायता कर सकता/सकती हूं?**"
    ]
  },

  te: {
    header_subtitle:"భారత ప్రభుత్వం · డిజిటల్ పౌర సేవలు",
    header_title:"పౌర సేవా సహాయకుడు",
    header_tagline:"AI-ఆధారిత ప్రభుత్వ సేవల మార్గదర్శి — 24×7 అందుబాటులో",
    stat_queries:"సమాధానాలు ఇచ్చిన ప్రశ్నలు",stat_resolution:"పరిష్కార రేటు",
    stat_response:"సగటు సమయం",stat_langs:"భాషలు సేవించాము",
    services_heading:"నేడు మేము మీకు ఎలా సహాయపడగలం?",
    tile_birth_label:"జనన ధృవీకరణ పత్రం",tile_birth_sub:"దరఖాస్తు, ప్రమాణపత్రాలు మరియు స్థితి",
    tile_ration_label:"రేషన్ కార్డు",tile_ration_sub:"BPL, PHH, AAY కార్డు వివరాలు",
    tile_pension_label:"పెన్షన్ పద్ధతులు",tile_pension_sub:"IGNOAPS మరియు IGNWPS వివరాలు",
    tile_tax_label:"ఆదాయపు పన్ను",tile_tax_sub:"ITR ఫైలింగ్, స్లాబులు మరియు మినహాయింపులు",
    tile_elig_label:"నా అర్హత తనిఖీ చేయండి",tile_elig_sub:"మీరు అర్హులైన పద్ధతులు కనుగొండి",
    tile_docs_btn:"📄 ప్రమాణపత్రాలు",tile_apply_btn:"🌐 ఆన్‌లైన్‌లో దరఖాస్తు",
    tile_itr_btn:"🌐 ITR ఫైల్ చేయండి",tile_criteria_btn:"📋 అన్ని నిబంధనలు",
    bot_name:"పౌర సేవ బాట్",bot_status:"ఆన్‌లైన్‌లో ఉంది",
    clear_chat:"చాట్ తొలగించు",live_agent_btn:"👤 లైవ్ ఏజెంట్",
    chat_placeholder:"మీ ప్రశ్న టైప్ చేయండి లేదా మైక్ వాడండి… (English, హిందీ, తెలుగు)",
    confidence_label:"సమాధాన నిజాయితీ:",
    eligibility_title:"🎯 అర్హత తనిఖీకర్త",
    eligibility_intro:"క్రింద మీ వివరాలు నింపండి. మేము అన్ని పద్ధతులకు మీ ప్రొఫైల్‌ను మూల్యాంకనం చేస్తాము.",
    form_sec_identity:"🪪 గుర్తు వివరాలు",form_sec_personal:"📋 వ్యక్తిగత వివరాలు",form_sec_location:"📍 స్థళం మరియు ఆర్థికం",
    label_full_name:"పూర్తి పేరు",label_aadhaar_name:"ఆధార్ ప్రకారం పేరు",label_pan_name:"PAN ప్రకారం పేరు",
    label_dob:"జన్మ తేదీ",label_age:"వయస్సు (సంవత్సరాలు)",label_gender:"లింగం",
    label_marital:"వైవాహిక స్థితి",label_state:"రాష్ట్రం",label_district:"జిల్లా",
    label_income:"వార్షిక కుటుంబ ఆదాయం (₹)",label_category:"సామాజిక వర్గం",
    hint_name_pan:"పేరు వ్యత్యాసం తనిఖీ చేస్తాము",hint_age:"మీ ప్రస్తుత వయస్సు",
    hint_marital:"విధవ పెన్షన్‌కు అవసరం",hint_income:"తెలిసినట్టేతే వదిలించండి",
    opt_not_specified:"— నిర్ధారించలేదు —",opt_select_state:"— రాష్ట్రం ఎంచుకోండి —",
    opt_female:"మహిళ",opt_male:"పురుషుడు",opt_other:"ఇతరులు",
    opt_married:"వివాహితులు/తులు",opt_widowed:"విధవ",opt_single:"వివాహం కానివారు",opt_divorced:"విడాకులు / విభజన",
    opt_sc:"SC (షేడ్యూల్డ్ కాస్ట్)",opt_st:"ST (షేడ్యూల్డ్ ట్రైబ్)",opt_obc:"OBC (ఇతర వెనుకబడిన వర్గాలు)",opt_general:"సాధారణ",
    eligibility_submit:"అన్ని పద్ధతులు తనిఖీసుకోండి →",eligibility_loading:"మూల్యాంకనం జరుగుతుంది…",close_eligibility:"✕",
    live_agent_title:"💬 లైవ్ ఏజెంట్‌తో కనెక్ట్ అవ్వండి",
    live_agent_intro:"మీ వివరాలు అందించండి, ఏజెంట్ సహాయం చేస్తారు.",
    label_your_name:"మీ పేరు",label_email:"ఇమెయిల్ చిరునామా",label_issue:"సమస్యను వివరించండి",
    ph_full_name:"పూర్తి పేరు",ph_email:"mee@email.com",ph_issue:"మీకు ఎలాంటి సహాయం కావాలి?",
    btn_connect_agent:"ఏజెంట్‌తో కనెక్ట్ అవ్వండి →",btn_cancel:"రద్దు చేయండి",
    ticket_created_h:"సపోర్ట్ టికెట్ సృష్టించబడింది",ticket_agent_msg:"ఏజెంట్ త్వరలో కనెక్ట్ అవుతారు.",
    ph_live_msg:"మీ సందేశం టైప్ చేయండి…",btn_send:"పంపించండి",typing_badge:"ఏజెంట్ టైప్ చేస్తున్నారు…",
    mismatch_title:"⚠️ సంభావ్య పేరు వ్యత్యాసం గుర్తించబడింది",mismatch_dismiss:"అర్థమైంది, కొనసాగించండి",mismatch_guide_btn:"అధికారిక మార్గదర్శనం చూడండి",
    redirect_title:"🌐 మీరు ఈ అప్లికేషన్ విడుచుకుంటున్నారు",
    redirect_intro:"మీరు అధికారిక ప్రభుత్వ వెబ్‌సైట్‌లో దరఖాస్తు కొనసాగించబోతున్నారు.",
    redirect_sub:"కొనసాగించలే ఈ ప్రమాణపత్రాలు సిద్ధంగా ఉంచుకోండి:",
    redirect_warning:"⚠️ కొనసాగించలే మీ వ్యక్తిగత సమాచారం అధికారిక పత్రాలతో సరిపోతుందా అని ధృవీకరించండి.",
    redirect_source:"అధికారిక .gov.in పోర్టల్‌కు రీడైరెక్ట్ అవుతుంది",
    redirect_cancel:"రద్దు చేయండి",redirect_confirm:"అధికారిక వెబ్‌సైట్‌కు వెళ్ళండి →",
    docs_modal_title:"అవసరమైన ప్రమాణపత్రాలు",docs_modal_sub:"దరఖాస్తుకు అవసరమైన పత్రాల జాబితా",
    footer_portals_title:"🏛️ అధికారిక ప్రభుత్వ పోర్టల్స్",
    disclaimer:"⚠️ నిరాకరణ: AI సమాధానాలు కేవలం సమాచార సేకరణకు మాత్రమే. చర్య తీసుకోవడానికి ముందు అధికారిక వనరులతో ధృవీకరించండి.",
    agent_portal_link:"ఏజెంట్ పోర్టల్",portal_label:"🔗 అధికారిక పోర్టల్స్:",
    welcome:[
      "🙏 **నమస్కారం!** భారత ప్రభుత్వ పౌర సేవా సహాయకుడికి స్వాగతం.",
      "","నేను ఇవి సహాయపడగలను:",
      "• జనన ధృవీకరణ పత్రం, రేషన్ కార్డు, పెన్షన్ పద్ధతులు",
      "• ఆదాయపు పన్ను ఫైలింగ్, రిబేట్లు మరియు రిఫండ్లు",
      "• ప్రభుత్వ స్కీమ్‌లకు అర్హత తనిఖీ",
      "• దరఖాస్తు తిరస్కరణ కారణాలు మరియు అప్పీళ్లు",
      "","**English, హిందీ లేదా తెలుగు**లో టైప్ చేయండి. వాయిస్ ఇన్‌పుట్‌కు 🎤 మైక్ బటన్ నొక్కండి.",
      "","**నేడు మీకు ఎలా సహాయపడగలను?**"
    ]
  }
};

/**
 * Return translated string for current language, falling back to English.
 */
function i18n(key) {
  const lang = (document.getElementById("lang-select") || {}).value || "en";
  return (I18N[lang] || I18N.en)[key] || I18N.en[key] || key;
}

/**
 * Apply all translations to DOM via data-i18n / data-i18n-placeholder attributes.
 * Call this once on load and again whenever language changes.
 */
function applyI18n() {
  const lang = (document.getElementById("lang-select") || {}).value || "en";
  const t = I18N[lang] || I18N.en;

  // Text content nodes
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (t[k] !== undefined) el.textContent = t[k];
  });

  // Placeholder attributes
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const k = el.getAttribute("data-i18n-placeholder");
    if (t[k] !== undefined) el.placeholder = t[k];
  });

  // Translate select options for gender, marital, category
  const selOpts = {
    "elig-gender":   [["","opt_not_specified"],["female","opt_female"],["male","opt_male"],["other","opt_other"]],
    "elig-marital":  [["","opt_not_specified"],["married","opt_married"],["widowed","opt_widowed"],["single","opt_single"],["divorced","opt_divorced"]],
    "elig-category": [["","opt_not_specified"],["SC","opt_sc"],["ST","opt_st"],["OBC","opt_obc"],["General","opt_general"]],
    "elig-state":    [["","opt_select_state"]],
  };
  Object.entries(selOpts).forEach(([id, pairs]) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    pairs.forEach(([val, key]) => {
      const opt = sel.querySelector(`option[value="${val}"]`);
      if (opt && t[key]) opt.textContent = t[key];
    });
  });

  // Analytics strip labels
  const labels = document.querySelectorAll(".stat-label");
  const lkeys = ["stat_queries","stat_resolution","stat_response","stat_langs"];
  labels.forEach((el, i) => { if (lkeys[i] && t[lkeys[i]]) el.textContent = t[lkeys[i]]; });

  // Live chat placeholders (if modal open)
  const laInput = document.getElementById("la-chat-input");
  if (laInput) laInput.placeholder = t.ph_live_msg || "";
  const typing = document.getElementById("la-typing");
  if (typing) typing.textContent = t.typing_badge || "";

  // Redirect modal static strings
  const rdWarning = document.querySelector(".redirect-warning");
  if (rdWarning) rdWarning.innerHTML = `<strong>${t.redirect_warning || ""}</strong>`;
  const rdSource  = document.querySelector(".redirect-source-badge");
  if (rdSource)  rdSource.innerHTML = `<span class="source-verified-dot"></span> ${t.redirect_source || ""}`;

  // Document body font for script support
  document.documentElement.lang = lang;
  document.body.style.fontFamily = lang === "hi"
    ? "'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif"
    : lang === "te"
    ? "'Noto Sans Telugu', 'Noto Sans', system-ui, sans-serif"
    : "'Noto Sans', system-ui, sans-serif";
}
