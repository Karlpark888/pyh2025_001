// ★ OpenAI API 키를 여기에 입력하세요(테스트 주의) ★
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY"; // 예: "sk-xxxxxxxxxxxxxxxx"

// 최대 사진 개수 (예: 50장 제한)
const MAX_PHOTO_COUNT = 50;

document.addEventListener("DOMContentLoaded", () => {
  const photoList = document.getElementById("photoList");
  const addPhotoButton = document.getElementById("addPhotoButton");
  const generateLifeButton = document.getElementById("generateLifeButton");
  const resultDiv = document.getElementById("result");

  // 페이지가 처음 로드될 때, 기본으로 1개의 사진 업로드 폼을 표시해 보자
  addNewPhotoItem();

  // "사진 추가" 버튼 클릭 시 새 사진 아이템 추가
  addPhotoButton.addEventListener("click", () => {
    // 현재 photoList에 몇 개의 photo-item이 있는지 확인
    const currentCount = photoList.querySelectorAll(".photo-item").length;
    if (currentCount >= MAX_PHOTO_COUNT) {
      alert(`사진은 최대 ${MAX_PHOTO_COUNT}장까지 업로드할 수 있습니다.`);
      return;
    }
    addNewPhotoItem();
  });

  // "생애보 생성" 버튼 클릭 시
  generateLifeButton.addEventListener("click", async () => {
    // 모든 사진 아이템의 설명을 수집
    const photoItems = photoList.querySelectorAll(".photo-item");
    if (photoItems.length === 0) {
      alert("사진을 최소 1장 이상 추가해주세요.");
      return;
    }

    let promptText = "다음은 여러 장의 사진 설명입니다.\n";
    promptText += "각 설명을 참고하여 한 사람(또는 여러 인물)의 생애보를 창의적으로 작성해주세요.\n\n";

    // 각 사진 설명을 순회하며 prompt에 추가
    let index = 1;
    for (let item of photoItems) {
      const fileInput = item.querySelector('input[type="file"]');
      const descTextarea = item.querySelector("textarea");
      const description = descTextarea.value.trim();
      // 여기서 이미지를 Base64로 변환할 수도 있지만, ChatGPT에는 텍스트만 전송됨
      // const file = fileInput.files[0];
      // if (file) {
      //   const base64Image = await convertFileToBase64(file);
      //   ...
      // }
      // Prompt엔 설명만 넣는다
      if (description) {
        promptText += `사진 #${index} 설명: ${description}\n`;
        index++;
      }
    }

    // ChatGPT에 보낼 내용
    // promptText 끝에 "이 정보를 바탕으로 생애보를 작성해줘"와 같은 문구 추가
    promptText += `\n위 사진들을 모두 참조하여, 가상의 인물(들)의 '생애보'를 만들어주세요. ` + 
                  `필요하다면 상상의 내용을 보충해도 좋습니다.\n`;

    // 실제 API 호출
    resultDiv.textContent = "생애보 생성 중입니다. 잠시만 기다려주세요...";
    try {
      const chatGPTReply = await callOpenAIChatGPT(promptText);
      if (chatGPTReply) {
        resultDiv.textContent = chatGPTReply;
      } else {
        resultDiv.textContent = "응답이 없습니다. 다시 시도해 보세요.";
      }
    } catch (error) {
      console.error(error);
      resultDiv.textContent = "오류가 발생했습니다. 콘솔을 확인하거나, API Key 설정을 확인하세요.";
    }
  });
});

/**
 * 사진 업로드 + 설명 입력 UI를 동적으로 추가하는 함수
 */
function addNewPhotoItem() {
  const photoList = document.getElementById("photoList");
  // photo-item 컨테이너 생성
  const photoItem = document.createElement("div");
  photoItem.classList.add("photo-item");

  // 파일 업로드
  const labelFile = document.createElement("label");
  labelFile.textContent = "사진 업로드:";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";

  // 사진 설명
  const labelDesc = document.createElement("label");
  labelDesc.textContent = "사진 설명:";
  const descTextarea = document.createElement("textarea");
  descTextarea.placeholder = "사진에 대한 배경 설명, 사진 속 인물 혹은 상황 등을 작성해보세요...";

  // photoItem에 요소 추가
  photoItem.appendChild(labelFile);
  photoItem.appendChild(fileInput);
  photoItem.appendChild(labelDesc);
  photoItem.appendChild(descTextarea);

  // photoList에 photoItem 추가
  photoList.appendChild(photoItem);
}

/**
 * OpenAI ChatGPT API 호출 함수
 * promptText를 전달해 gpt-3.5-turbo 모델로부터 응답을 받아옴
 */
async function callOpenAIChatGPT(promptText) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that creates a biography (생애보) based on multiple photo descriptions.",
        },
        {
          role: "user",
          content: promptText,
        },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI API Error: " + (response.statusText || response.status));
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim();
}

/**
 * (선택) 파일을 Base64로 변환하는 함수
 * 여기서는 실제로 ChatGPT에 이미지를 보낼 수 없으므로 필요하다면
 * 미리보기 용도로만 사용할 수 있음.
 */
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result); // Base64
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}
