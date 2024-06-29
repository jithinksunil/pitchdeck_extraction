const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const pdftopic = require('pdftopic');
const Papa = require('papaparse');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary');
dotenv.config();
cloudinary.v2.config({
  cloud_name: 'df8w69xon',
  api_key: '818129511951146',
  api_secret: '_R4yasVlyG3hpD01R8M1Fbz4i6I',
});
const openAiapiKey = process.env.OPENAI_API_KEY;

const main = async () => {
  const startTime = logCurrentTime();
  console.log('Job started at ' + startTime);
  const pdfFiles = getFiles();
  const extractedDetailsPromise = [];
  for (const { file, filePath } of pdfFiles) {
    console.log(`Conversion of pdf to image started (${file})`);
    const bufferArray = await convertToImageBufferArray(filePath);
    console.log(`Conversion of pdf to image completed (${file})`);
    const promise = backgroundExtraction(bufferArray, file);
    extractedDetailsPromise.push(promise);
  }
  const extractedDetails = await Promise.all(extractedDetailsPromise);
  await convertToCsv(extractedDetails);
  const endTime = logCurrentTime();
  console.log('Wow! Its done!');
  console.log('Job started at ' + startTime);
  console.log('Job finshed at ' + endTime);
};

main();
function getFiles() {
  const pdfFolder = './pdfFiles';
  const pdfFiles = fs
    .readdirSync(pdfFolder)
    .filter((file) => path.extname(file) === '.pdf')
    .map((file) => {
      const filePath = path.join(pdfFolder, file);
      return { file, filePath };
    });
  return pdfFiles;
}
async function backgroundExtraction(bufferArray, file) {
  console.log(`Context extraction of started (${file})`);
  const context = await extractPdfContextWithAi(bufferArray, file);
  console.log(`Context extraction of completed (${file})`);
  console.log(`Request data analysis of started (${file})`);
  const jsonResponse = await extractRequestData(context, file);
  console.log(`Request data analysis of completed (${file})`);
  jsonResponse.file = file;
  jsonResponse.inputContext = context;
  return jsonResponse;
}
async function convertToImageBufferArray(pdfPath) {
  const curriculum_vitae = fs.readFileSync(pdfPath);
  return await pdftopic.pdftobuffer(curriculum_vitae, 'all');
}
const defaultCsvHeaders = {
  file: 'N/A',
  companyName: 'N/A',
  description: 'N/A',
  marketType: 'N/A',
  keywords: 'N/A',
  founded: 'N/A',
  countryOfOrigin: 'N/A',
  countryOfOperation: 'N/A',
  lastFundingRound: 'N/A',
  lastFundingYear: 'N/A',
  nextFundingRound: 'N/A',
  nextFundingTarget: 'N/A',
  latestMonthlyRevenue: 'N/A',
  revenue: 'N/A',
  currency: 'N/A',
  website: 'N/A',
  socialMedia: 'N/A',
  demo: 'N/A',
  inputContext: 'N/A',
};
async function extractPdfContextWithAi(bufferArray, file) {
  try {
    const urls = buffersToUrls(bufferArray);
    return await contextExtractionPrompts(urls);
  } catch (error) {
    console.log(error);
    try {
      if (error?.status == 429) {
        console.log(
          'Started uploading Pdfs to cloud as images dues to token limit error'
        );
        const uploadPromises = bufferArray.map((buffer) =>
          uploadToCloud(buffer)
        );
        const uploads = (await Promise.allSettled(uploadPromises))
          .filter((promise) => promise.status == 'fulfilled')
          .map((promise) => promise.value);
        console.log('Completed uploading Pdfs to cloud ' + `(${file})`);
        const answer = await contextExtractionPrompts(
          uploads.map(({ url }) => url)
        );
        console.log('Deleting from cloud ' + `(${file})`);
        uploads.map(({ public_id }) =>
          deleteFromCloud(public_id).catch((err) => console.log(err))
        );
        return answer;
      }
      throw new Error(error);
    } catch (error) {
      console.log('\n' + 'Error while context extraction of ' + file);
      console.log(error?.error?.message || error, '\n');
      return JSON.stringify(defaultCsvHeaders);
    }
  }
}

async function contextExtractionPrompts(urls) {
  const openai = new OpenAI({
    apiKey: openAiapiKey,
  });
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      {
        role: 'system',
        content:
          'You are an advanced information extraction assistant. Your task is to extract specific details from the pitch decks of companies. The information you provide will be used by venture capitals to assess potential investments. Ensure each detail is 100% accurate, and if you are unsure about the accuracy, respond with "not available".',
      },
      {
        role: 'system',
        content: `The pitch decks may contain textual, graphical, and visual representations. Interpret all forms of content while generating your response. Never guess or provide inaccurate details.`,
      },
      {
        role: 'system',
        content: `You need to find the following details from the images. If you cannot find a detail or if you are not 100% sure about its accuracy, respond with "not available":
        1. **companyName**: The name of the company. Do not guess; if not found, say "not available".
        2. **description**: A description of the company based on the context of all images. Create a comprehensive summary if possible.
        3. **marketType**: Identify if the company targets B2B, B2C, or both. Make an educated guess based on offerings, audience, and channels if not explicitly mentioned. If unsure, say "not available".
        4. **keywords**: An array of relevant keywords (e.g., Aerospace, AI, Fintech). If no keywords are found, say "not available".
        5. **countryOfOrigin**: The country where the company was founded. Use full country names (e.g., United Kingdom, United States of America). If not found, say "not available".
        6. **countryOfOperation**: An array of countries where the company operates. Use full country names. If no country of operation is found, say "not available".
        7. **founded**: The date the company was founded. If not found, say "not available".
        8. **lastFundingRound**: The most recent funding round (e.g., Pre-Seed, Seed, Pre-Series A, Series A, Series B, Series C). Assume "Pre-Seed" if not found from images and the company is new. If not found, say "not available".
        9. **lastFundingYear**: The year of the most recent funding round. If not found, say "not available".
        10. **nextFundingRound**: The next planned funding round explicitly mentioned. If the last funding round is available but the next funding round is not explicitly mentioned, use the following logic: 
        - If the last funding round is Pre-Seed, the next funding round is Seed.
        - If the last funding round is Seed, the next funding round is Pre-Series A.
        - If the last funding round is Pre-Series A, the next funding round is Series A.
        - If the last funding round is Series A, the next funding round is Series B.
        - If the last funding round is Series B, the next funding round is Series C.
        - If the last funding round is Series C, respond with "not available".
        If both last and next funding rounds are not found, respond with "not available".
        11. **nextFundingTarget**: The target amount for the next funding round converted to USD. If nextFundingTarget is converted to USD, give only the USD value. If not found, say "not available".
        12. **latestMonthlyRevenue**: The latest monthly revenue figure converted to USD. If MRR is not available and revenue is present then divide revenue with 12 and consider as MRR then convert it to USD. If MRR is converted to USD, give only the USD value. If both MRR and revenue is not found, say "not available".
        13. **revenue**: The company's annual revenue (ARR) converted to USD. If revenue is not available and Monthly Recurring Revenue (MRR) is found, multiply by 12 and consider as revenue then convert it to USD.If revenue is converted to USD, give only the USD value. If both revenue and MRR is not found, say "not available".
        14. **currency**: Use USD if the revenue, MRR and next funding target is converted to USD.If not converted use the currency with revenue figures. If not found, say "not available".
        15. **website**: If the company's website URL is explicitly mentioned, extract and provide it. If website URL is not explicitly mentioned but one of the domain based business email address is present, then infer this domain as the website url ( like email@example.com then website will be example.com ). I repeat that you can only infer website url from email only if the email address is a business email address based on the company's domain. If not found, say "not available".
        16. **socialMedia**: Links to the company's social media profiles, which are explicitly mentioned. If not found, say "not available".
        17. **demo**: A link to the company's demo video, which is explicitly mentioned. If not found, say "not available".`,
      },
      {
        role: 'system',
        content: `Use your last updated values for currency conversion`,
      },
      {
        role: 'system',
        content: `Always prioritize accuracy. If you are not sure about a detail, respond with "not available".`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Each page of the pitch deck is here. Extract the described details from these images:',
          },
          ...urls.map((url) => ({
            type: 'image_url',
            image_url: {
              url,
            },
          })),
        ],
      },
    ],
  });
  const answer = response.choices[0].message.content;
  console.log(answer);
  return answer.trim().replace(/\n/g, ' ');
}
function buffersToUrls(bufferArray) {
  const base64Strings = bufferArray.map((buffer) => buffer.toString('base64'));
  return base64Strings.map((base64) => `data:image/jpeg;base64,${base64}`);
}
async function extractRequestData(context, file) {
  try {
    const openai = new OpenAI({
      apiKey: openAiapiKey,
    });
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are a tool which find details from a context and transform these details to a specific json format',
        },

        {
          role: 'system',
          content: `Required json format is  
                {
                  "companyName":string | null;
                  "description": string | null;
                  "marketType": string | null;
                  "keywords": string[];
                  "countryOfOrigin": string | null;
                  "countryOfOperation":string[];
                  "founded":string | null;
                  "lastFundingRound":string | null;
                  "lastFundingYear":string | null;
                  "nextFundingRound":string | null;
                  "nextFundingTarget":number | null; 
                  "latestMonthlyRevenue":number | null;
                  "revenue": number | null;
                  "currency":string | null;
                  "website":string | null;
                  "socialMedia":string | null;
                  "demo":string | null;
                }
                
                `,
        },
        {
          role: 'system',
          content: `Explanation for each key in the json format as follows:-
          1. companyName:  The name of the company. Do not guess, if not found or not 100% sure return null".
          2. description:  A description of the company based on the context of all images. Create a comprehensive summary if possible.
          3. marketType:  Identify if the company targets B2B, B2C, or both. Make an educated guess based on offerings, audience, and channels if not explicitly mentioned, if not found or not 100% sure return null".
          4. keywords:  An array of relevant keywords (e.g., Aerospace, AI, Fintech). If no keywords are found return []".
          5. countryOfOrigin:  The country where the company was founded. Use full country names (e.g., United Kingdom, United States of America), if not found or not 100% sure return null".
          6. countryOfOperation:  An array of countries where the company operates. Use full country names. If no country of operation is found, if not found or not 100% return []".
          7. founded:  The date the company was founded as an ISO string ( ie. if founded in 2020 the value will be 2020-01-01T00:00:00 ), if not found or not 100% sure return null".
          8. lastFundingRound:  The most recent funding round (e.g., Pre-Seed, Seed, Pre-Series A, Series A, Series B, Series C). Assume "Pre-Seed" if not found from images and the company is new, if not found or not 100% sure return null".
          9. lastFundingYear:  The year of the most recent funding round as an ISO string ( ie. if the last funding year is 2021 june the value will be 2021-06-01T00:00:00 ), if not found or not 100% sure return null".
          10. nextFundingRound:  The next planned funding round explicitly mentioned. If the last funding round is available but the next funding round is not explicitly mentioned, use the following logic:  
          - If the last funding round is Pre-Seed, the next funding round is Seed.
          - If the last funding round is Seed, the next funding round is Pre-Series A.
          - If the last funding round is Pre-Series A, the next funding round is Series A.
          - If the last funding round is Series A, the next funding round is Series B.
          - If the last funding round is Series B, the next funding round is Series C.
          - If the last funding round is Series C, respond with "not available".
          If both last and next funding rounds are not found or 100% sure return null".
          11. nextFundingTarget:  The target amount for the next funding round in millions ( ie. if the next funding taget is found as 3000000 USD the value of the field will be 3 ), if not found or not 100% sure return null.
          12. latestMonthlyRevenue:  The latest monthly revenue figure as an absolute value. If MRR is not available and revenue is present then divide revenue with 12 and consider as MRR then give it as an absolute value (ie. if the revenue is 1500000 USD of 1.5 million USD the value of the revenue field will be 1500000). If both MRR and revenue are not found or 100% sure return null.
          13. revenue:  The company's annual revenue (ARR) as an absolute value. If revenue is not available and Monthly Recurring Revenue (MRR) is found, multiply by 12 and consider as revenue then give it as an absolute value (ie. if the MRR is 500000 USD of 0.5 million USD the value of the revenue field will be 500000). If both revenue and MRR are not found or 100% sure return null.
          14. currency:  It is the currency mentioned with revenue ,MRR and next funding target, if not found or not 100% sure return null.
          15. website:  If the company's website URL is explicitly mentioned, extract and provide it. If website URL is not explicitly mentioned but one of the domain based business email address is present, then infer this domain as the website url ( like email@example.com then website will be example.com ). I repeat that you can only infer website url from email only if the email address is a business email address based on the company's domain, if not found or not 100% sure return null.
          16. socialMedia:  Links to the company's social media profiles, which are explicitly mentioned, if not found or not 100% sure return null.
          17. demo:  A link to the company's demo video, which is explicitly mentioned, if not found or not 100% sure return null.`,
        },

        {
          role: 'system',
          content: `The response must be in json format, because the response you given will be used as the argument for the typescript method JSON.parse() immediatly without any alteration, so be carefull when giving the output and it must not cause the code flow to break
                a sample response which have all the details available will be like
                {
                  "companyName":"Example company",
                  "description": "An example of description blah blah blah.",
                  "marketType": "B2B",
                  "keywords": ["keyword1","keyword2","keyword3","keyord4"],
                  "countryOfOrigin": "United Kingdom",
                  "countryOfOperation":["United Kingdom", "United State of America", "Germany", "India"],
                  "founded":"2021-06-01T00:00:00",
                  "lastFundingRound":"Series-B",
                  "lastFundingYear":"2023-06-01T00:00:00",
                  "nextFundingRound":"Series-C",
                  "nextFundingTarget": 2, 
                  "latestMonthlyRevenue":150400,
                  "revenue": 1204800,
                  "currency": "USD",
                  "website":"https://samplecompany.com",
                  "socialMedia":"https://socialmedia.com/blahblah/blah",
                  "demo":"https://somedomain.com/blahblah/blah"
                }
                a sample response which have no details available will be like
                {
                  "companyName":null,
                  "description": null,
                  "marketType": null,
                  "keywords": [],
                  "countryOfOrigin": null,
                  "countryOfOperation":[],
                  "founded":null,
                  "lastFundingRound":null,
                  "lastFundingYear":null,
                  "nextFundingRound":null,
                  "nextFundingTarget": null, 
                  "latestMonthlyRevenue":null,
                  "revenue": null,
                  "currency": null,
                  "website":null,
                  "socialMedia":null,
                  "demo":null
                }
                `,
        },
        {
          role: 'system',
          content:
            'Keep in mind that never guess and give random answers, if you cannot find or not 100% sure about a specific details just give the value as null',
        },
        {
          role: 'system',
          content: `Context to analyse is ${context}`,
        },
        {
          role: 'system',
          content: `I repeat the response will be immediately used as the argument for JSON.parse() method with out any alteration. So the response must be in json format where it start with open curly braze in the start and closing curly braze in the end, a different kind of response is not allowed`,
        },
        {
          role: 'system',
          content: `Analyse and give the output in json format`,
        },
      ],
      model: 'gpt-4-turbo',
    });

    const answer = chatCompletion.choices[0].message.content;
    const jsonRegex = /\{[\s\S]*?\}/;
    const jsonString = answer.match(jsonRegex);
    const jsonOutput = JSON.parse(jsonString[0]);
    const comparisonOutput = {
      companyName: '',
      description: '',
      marketType: '',
      keywords: [''],
      founded: '',
      countryOfOrigin: '',
      countryOfOperation: [''],
      lastFundingRound: '',
      lastFundingYear: '',
      nextFundingRound: '',
      nextFundingTarget: 0,
      latestMonthlyRevenue: 0,
      revenue: 0,
      currency: '',
      website: '',
      socialMedia: '',
      demo: '',
      inputContext: '',
      file: '',
    };
    if (jsonOutput.founded) {
      try {
        jsonOutput.founded = new Date(jsonOutput.founded).toISOString();
      } catch (error) {
        jsonOutput.founded = null;
      }
    }
    if (jsonOutput.lastFundingYear) {
      try {
        jsonOutput.lastFundingYear = new Date(
          jsonOutput.lastFundingYear
        ).toISOString();
      } catch (error) {
        jsonOutput.lastFundingYear = null;
      }
    }
    Object.entries(jsonOutput).map(([key, value]) => {
      if (!value) {
        return delete jsonOutput[key];
      }
      if (typeof jsonOutput[key] !== typeof comparisonOutput[key]) {
        delete jsonOutput[key];
      }
    });
    return jsonOutput;
  } catch (error) {
    console.log('\n Error while analysing request details of ' + file);
    console.log(error?.error?.message || error, '\n');
    return {};
  }
}

async function convertToCsv(data) {
  const flattenData = data.map((item) => {
    const flattenObject = { ...defaultCsvHeaders };
    Object.entries(flattenObject).map(([key]) => {
      if (item[key]) {
        flattenObject[key] = item[key];
      }
    });
    if (item?.countryOfOperation?.length) {
      flattenObject.countryOfOperation = item.countryOfOperation.join(', ');
    }
    if (item?.keywords?.length) {
      flattenObject.keywords = item.keywords.join(', ');
    }
    if (item.founded) {
      flattenObject.founded = formatISODateToCustom(item.founded);
    }
    if (item.lastFundingYear) {
      flattenObject.lastFundingYear = formatISODateToCustom(
        item.lastFundingYear
      );
    }
    return flattenObject;
  });
  const csv = Papa.unparse(flattenData);
  const csvBuffer = Buffer.from(csv, 'utf-8');
  fs.writeFileSync(
    `./csvFiles/alfred_exported_data_${new Date()}.csv`,
    csvBuffer
  );
}

// Call the function to log the current time

function logCurrentTime() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';

  // Convert hours from 24-hour format to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'

  // Pad minutes and seconds with leading zeros if necessary
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  const secondsStr = seconds < 10 ? '0' + seconds : seconds;

  const timeString = `${hours}:${minutesStr}:${secondsStr} ${ampm}`;

  return timeString;
}

function formatISODateToCustom(isoString) {
  const date = new Date(isoString);

  const monthAbbreviations = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const month = date.getMonth();
  const year = date.getFullYear();

  // Format the result as "MMM - YYYY"
  return `${monthAbbreviations[month]} - ${year}`;
}
const uploadToCloud = async (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      { folder: 'convertedPitches' },
      (error, result) => {
        if (error) {
          return reject('Files connot be uploaded');
        }
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};
const deleteFromCloud = async (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.v2.uploader.destroy(publicId, (error, result) => {
      if (error) {
        return reject('File cannot be deleted');
      }
      resolve(result);
    });
  });
};
