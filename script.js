/***** ✅ 사용자가 직접 수정해야 하는 부분 *****/
// 깃허브 저장소 정보 입력
const GITHUB = {
  owner: "yslee11",      // ✅ 본인 깃허브 ID
  repo: "hy_llm_1",       // ✅ 저장소 이름
  branch: "main",               // ✅ 브랜치 (보통 main)
  path: "images"                // ✅ 이미지 폴더 이름
};

// Google Apps Script Web App URL 입력
// ✅ Apps Script 코드를 수정한 후 새 배포 URL을 여기에 붙여넣으세요.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqfLee-zKl4CMZhAzPA1pYPXxjYcjSphU1ix2Tbn6AwXkMFKk5hkEwZlkZKJYlFZAJ/exec";

/*****************************************************/

const SAMPLE_SIZE = 5;
let currentImage = 0;
let responses = [];
let participant = { gender: "", age: "", job: "" };
let selectedImages = [];
const userID = generateUserID();
let isSubmitting = false;

function generateUserID() {
  return 'xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

//offset 읽기/저장 함수 추가
function getGroupOffset(group) {
  return parseInt(localStorage.getItem(`offset_${group}`) || "0", 10);
}

function setGroupOffset(group, value) {
  localStorage.setItem(`offset_${group}`, value);
}



//점수 수집 함수
function getScores() {
  const metrics = ["beauty", "attractivity", "liveliness", "walkability", "safety", "comfort"];
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



function getImageID(url) {
  return url.split('/').pop();
}

// 페이지 전환
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
}

// 이미지 목록 불러오기 (GitHub API)
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

  const images = data.tree
    .filter(item =>
      item.type === "blob" &&
      item.path.startsWith(`${GITHUB.path}/${folder}/`) &&
      exts.test(item.path)
    )
    .map(item =>
      `https://raw.githubusercontent.com/${GITHUB.owner}/${GITHUB.repo}/${GITHUB.branch}/${item.path}`
    );

  return images;
}



// 설문 초기화
async function initSurvey() {
  const allImages = await getImageList();

  const sortedImages = [...allImages].sort((a, b) => {
    const nameA = a.split('/').pop();
    const nameB = b.split('/').pop();
    return nameA.localeCompare(nameB, undefined, { numeric: true });
  });

  const group = getGroupFolder(participant.gender, participant.age);
  const offset = getGroupOffset(group);

  selectedImages = sortedImages.slice(
    offset,
    offset + SAMPLE_SIZE
  );

  console.log("📦 그룹:", group);
  console.log("📦 offset:", offset);
  console.log("📦 이번 이미지:", selectedImages.map(getImageID));

  currentImage = 0;
  responses = [];
  loadImage();
}






//폴더이름생성
function getGroupFolder(gender, age) {
  const g = gender === "남" ? "male" : "female";
  let ageGroup = "";

  if (age === "10대" || age === "20대") {
    ageGroup = "youth";
  } 
  else if (age === "30대" || age === "40대" || age === "50대") {
    ageGroup = "adult";
  } 
  else if (age === "60대 이상") {
    ageGroup = "senior";
  }

  return `${g}_${ageGroup}`;
}



// 이미지 로딩
function loadImage() {
  const img = document.getElementById("survey-image");
  const loadingEl = document.getElementById("loading");
  
  // 로딩 표시
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
    loadingEl.style.display = "block";
    updateProgress();
    clearScoreSelection();
  };
  
  img.src = selectedImages[currentImage];
}

// 진행상황 업데이트
function updateProgress() {
  document.getElementById("progress").textContent = 
    `${currentImage + 1} / ${selectedImages.length}`;
}

// 다음 질문
async function nextQuestion() {
  const scores = getScores();

  if (!scores) {
    alert("⚠️ 모든 항목에 대해 점수를 선택해주세요.");
    return;
  }

  responses.push({
    timestamp: new Date().toISOString(),
    imageID: getImageID(selectedImages[currentImage]),
    group: getGroupFolder(participant.gender, participant.age),
    beauty: scores.beauty,
    attractivity: scores.attractivity,
    liveliness: scores.liveliness,
    walkability: scores.walkability,
    safety: scores.safety,
    comfort: scores.comfort
  });

  if (currentImage >= selectedImages.length - 1) {

  // 🚫 이미 제출 중이면 무시
    if (isSubmitting) return;

    isSubmitting = true;

  // 버튼 비활성화
    disableSurveyButtons();

    try {
      await submitSurvey();
    } catch (e) {
    // 제출 실패 시 다시 활성화
      isSubmitting = false;
      enableSurveyButtons();
    }

    return;
  }

  currentImage++;
  loadImage();
}


// 이전 질문
function prevQuestion() {
  if (currentImage > 0) {
    currentImage--;
    responses.pop();
    loadImage();
  }
}


// 버튼 비활성화 / 활성화 함수 추가
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

// ✅ 수정된 제출 함수 - 완전한 JSONP 방식
function submitSurvey() {
  return new Promise((resolve, reject) => {
    const submitData = {
      participant,
      userID,
      responses
    };

    console.log("제출할 데이터:", submitData);

    // 콜백 함수 이름 생성 (유니크하게)
    const callbackName = 'jsonpCallback_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    
    // URL 생성 (GET 방식으로 변경)
    const url = `${APPS_SCRIPT_URL}?callback=${callbackName}&data=${encodeURIComponent(JSON.stringify(submitData))}`;
    
    console.log("요청 URL:", url);
    
    // JSONP 응답을 처리할 글로벌 함수 정의
    window[callbackName] = function(result) {
      console.log("서버 응답:", result);
      
      // 타임아웃 정리
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // script 태그 제거
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      
      // 글로벌 함수 정리
      delete window[callbackName];
      
      if (result && result.status === "success") {
        const group = getGroupFolder(participant.gender, participant.age);
        const offset = getGroupOffset(group);
        setGroupOffset(group, offset + SAMPLE_SIZE);
        
        console.log("제출 성공");
        showPage("end-page");
        resolve(result);
      } else {
        console.error("제출 실패:", result);
        alert("제출 중 오류 발생: " + (result ? result.message : "알 수 없는 오류"));
        reject(new Error(result ? result.message : "제출 실패"));
      }
    };

    // 동적으로 script 태그를 생성하여 JSONP 요청
    const script = document.createElement('script');
    script.src = url;
    
    // 에러 처리
    script.onerror = function() {
      console.error("JSONP 요청 실패");
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      
      delete window[callbackName];
      
      alert("네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.");
      reject(new Error("네트워크 오류"));
    };
    
    // 타임아웃 설정 (30초)
    const timeoutId = setTimeout(() => {
      console.error("제출 타임아웃");
      
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      
      delete window[callbackName];
      
      alert("제출 시간이 초과되었습니다. 다시 시도해 주세요.");
      reject(new Error("타임아웃"));
    }, 30000);
    
    // 문서에 추가하여 요청 실행
    document.head.appendChild(script);
    console.log("JSONP 요청 시작");
  });
}

// 이벤트 바인딩
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startBtn").addEventListener("click", () => {
    const gender = document.querySelector('input[name="gender"]:checked');
    const age = document.getElementById("age").value;
    const job = document.getElementById("job").value;
    
    if (!gender || !age || !job) {
      alert("⚠️ 성별, 연령대, 직업을 모두 선택해주세요.");
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
