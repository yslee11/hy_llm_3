/***** ✅ 설정 *****/
const GITHUB = {
  owner: "yslee11",
  repo: "hy_llm_3",
  branch: "main",
  path: "images"
};

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx0fGdRs8rhHW4PZo-sHWeqkohqY3QuKZ9qqAhU_0DycABbYKYCwy1iMPKR-WvSfIdMUA/exec";

const SAMPLE_SIZE = 12;

/*****************************************************/

let currentImage = 0;
let responses = [];
let participant = { gender: "", age: "", job: "" };
let selectedImages = [];
const userID = generateUserID();
let isSubmitting = false;

/*****************************************************/
/* 유틸 함수 */
/*****************************************************/

function generateUserID() {
  return 'xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

function getImageID(url) {
  return url.split('/').pop();
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
}

function getGroupFolder(gender, age) {
  const g = gender === "남" ? "male" : "female";
  let ageGroup = "";

  if (age === "10대" || age === "20대") ageGroup = "youth";
  else if (age === "30대" || age === "40대" || age === "50대") ageGroup = "adult";
  else if (age === "60대 이상") ageGroup = "senior";

  return `${g}_${ageGroup}`;
}

/*****************************************************/
/* GitHub 이미지 목록 */
/*****************************************************/

async function getImageList() {
  const folder = getGroupFolder(participant.gender, participant.age);

  const api = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/git/trees/${GITHUB.branch}?recursive=1`;
  const res = await fetch(api);
  const data = await res.json();

  if (!data.tree) {
    console.error("GitHub API 오류", data);
    return [];
  }

  const exts = /\.(jpg|jpeg|png|webp)$/i;

  return data.tree
    .filter(item =>
      item.type === "blob" &&
      item.path.startsWith(`${GITHUB.path}/${folder}/`) &&
      exts.test(item.path)
    )
    .map(item =>
      `https://raw.githubusercontent.com/${GITHUB.owner}/${GITHUB.repo}/${GITHUB.branch}/${item.path}`
    )
    .sort((a, b) =>
      a.split('/').pop().localeCompare(
        b.split('/').pop(),
        undefined,
        { numeric: true }
      )
    );
}

/*****************************************************/
/* 🔥 서버에서 offset 가져오기 */
/*****************************************************/

function fetchGroupOffset(group) {
  return new Promise((resolve, reject) => {

    const callbackName = "jsonpOffset_" + Date.now();

    const url =
      `${APPS_SCRIPT_URL}?mode=reserveOffset
` +
      `&group=${group}` +
      `&callback=${callbackName}`;

    window[callbackName] = function(result) {

      delete window[callbackName];
      document.head.removeChild(script);

      if (result.status === "success") {
        resolve(result.offset);
      } else {
        reject(result.message);
      }
    };

    const script = document.createElement("script");
    script.src = url;

    script.onerror = () => {
      delete window[callbackName];
      reject("Offset 요청 실패");
    };

    document.head.appendChild(script);
  });
}

/*****************************************************/
/* 설문 초기화 */
/*****************************************************/

async function initSurvey() {

  const group = getGroupFolder(participant.gender, participant.age);

  try {

    const offset = await fetchGroupOffset(group);

    const allImages = await getImageList();

    selectedImages = allImages.slice(
      offset,
      offset + SAMPLE_SIZE
    );

    currentImage = 0;
    responses = [];

    loadImage();

  } catch (err) {
    alert("초기화 중 오류 발생: " + err);
  }
}

/*****************************************************/
/* 이미지 로딩 */
/*****************************************************/

function loadImage() {

  const img = document.getElementById("survey-image");
  const loadingEl = document.getElementById("loading");

  loadingEl.style.display = "block";
  img.style.display = "none";

  img.onload = function() {
    loadingEl.style.display = "none";
    img.style.display = "block";
    updateProgress();
    clearScoreSelection();
  };

  img.onerror = function() {
    loadingEl.style.display = "none";
    loadingEl.textContent = "이미지 로딩 실패";
  };

  img.src = selectedImages[currentImage];
}

function updateProgress() {
  document.getElementById("progress").textContent =
    `${currentImage + 1} / ${selectedImages.length}`;
}

/*****************************************************/
/* 점수 처리 */
/*****************************************************/

function getScores() {
  const metrics = ["safety","lively","beauty","wealthy","boring","depression"];
  const scores = {};

  for (const m of metrics) {
    const checked = document.querySelector(`input[name="${m}"]:checked`);
    if (!checked) return null;
    scores[m] = parseInt(checked.value);
  }
  return scores;
}

function clearScoreSelection() {
  document
    .querySelectorAll('#score-form input[type="radio"]')
    .forEach(r => r.checked = false);
}

/*****************************************************/
/* 다음 / 이전 */
/*****************************************************/

async function nextQuestion() {

  const scores = getScores();
  if (!scores) {
    alert("⚠️ 모든 항목을 선택해주세요.");
    return;
  }

  responses.push({
    timestamp: new Date().toISOString(),
    imageID: getImageID(selectedImages[currentImage]),
    safety: scores.safety,
    lively: scores.lively,
    beauty: scores.beauty,
    wealthy: scores.wealthy,
    boring: scores.boring,
    depression: scores.depression
  });

  if (currentImage >= selectedImages.length - 1) {

    if (isSubmitting) return;
    isSubmitting = true;

    disableSurveyButtons();

    try {
      await submitSurvey();
    } catch (e) {
      enableSurveyButtons();
      isSubmitting = false;
    }

    return;
  }

  currentImage++;
  loadImage();
}

function prevQuestion() {
  if (currentImage > 0) {
    currentImage--;
    responses.pop();
    loadImage();
  }
}

/*****************************************************/
/* 제출 */
/*****************************************************/

function submitSurvey() {

  return new Promise((resolve, reject) => {

    const submitData = {
      participant,
      userID,
      responses
    };

    const callbackName = "jsonpSubmit_" + Date.now();

    const url =
      `${APPS_SCRIPT_URL}?mode=submit` +
      `&callback=${callbackName}` +
      `&data=${encodeURIComponent(JSON.stringify(submitData))}`;

    window[callbackName] = function(result) {

      delete window[callbackName];
      document.head.removeChild(script);

      if (result.status === "success") {
        showPage("end-page");
        resolve();
      } else {
        alert("제출 오류: " + result.message);
        reject();
      }
    };

    const script = document.createElement("script");
    script.src = url;

    script.onerror = function() {
      delete window[callbackName];
      reject("네트워크 오류");
    };

    document.head.appendChild(script);
  });
}

function disableSurveyButtons() {
  document.getElementById("nextBtn").disabled = true;
  document.getElementById("prevBtn").disabled = true;
  document.getElementById("nextBtn").textContent = "제출 중...";
}

function enableSurveyButtons() {
  document.getElementById("nextBtn").disabled = false;
  document.getElementById("prevBtn").disabled = false;
  document.getElementById("nextBtn").textContent = "다음";
}

/*****************************************************/
/* 이벤트 바인딩 */
/*****************************************************/

document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("startBtn").addEventListener("click", () => {

    const gender = document.querySelector('input[name="gender"]:checked');
    const age = document.getElementById("age").value;
    const job = document.getElementById("job").value;

    if (!gender || !age || !job) {
      alert("⚠️ 모든 정보를 입력해주세요.");
      return;
    }

    participant.gender = gender.value;
    participant.age = age;
    participant.job = job;

    showPage("survey-page");
    initSurvey();
  });

  document.getElementById("nextBtn").addEventListener("click", nextQuestion);
  document.getElementById("prevBtn").addEventListener("click", prevQuestion);
});
