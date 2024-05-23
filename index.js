const OpenAI = require('openai');
const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');
const Papa = require('papaparse');
const openAiapiKey='api-key-here'
const extractRequestData = async (context) => {
  const openai = new OpenAI({
    apiKey: openAiapiKey,
  });
  const chatCompletion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          'Understand what is a venture capital, portfolio company and the pitchdeck of the portfolio company from internet',
      },
      {
        role: 'system',
        content: `Context to analyse is ${context}`,
      },
      {
        role: 'system',
        content:
          'You are a information collecting tool from the context extracted from a pitchdeck of a portfolio company using a pdf parsing tool called pdf parser',
      },

      {
        role: 'system',
        content: `The informations found by you will be used by the venture capitals to find the portfolio company is a good match for them to invest`,
      },
      {
        role: 'system',
        content: `I will mention which are the informations you have to find from the context, and the informations must be given in json format, because the response you given will be used as the argument for the typescript method JSON.parse() immediatly without any alteration, so be carefull when giving the output and it must not cause the code flow to break`,
      },
      {
        role: 'system',
        content: `find if the website information is availible in the context, if it is availible understand about the compnay from the website aswell and consider the informations from the website along with the provided context while analysing the context`,
      },

      {
        role: 'system',
        content: `The respose must be in the following format {
                  companyName:name of company,
                  description: description of company,
                  marketType: market type of company,
                  keywords: array of  keywords suitable for the company,
                  revenue: revenue of company,
                  latestMonthlyRevenue:latest monthly revenue,
                  currency:currency where the revenue is described,
                  countryOfOrigin: country of company where it initially founded,
                  countryOfOperation:countries where the company is functioning,
                  founded: date at which the company is founded,
                  lastFundingRound:last funding round,
                  lastFundingYear:last funding year,
                  nextFundingRound:next funding round,
                  nextFundingTarget:next funding target in millions,
                  website:website of the company,
                  socialMedia:social media link,
                  demo:demo link
                  }`,
      },
      {
        role: 'system',
        content:
          'Keep in mind that never guess and give a random answer, if you cannot find the information just give the value as null',
      },
      {
        role: 'system',
        content: `Explanation for each key in the format as follows:-
                1. companyName is the name of the company, never guess the name , if you cannot find it give it as null.
                2. description is the description about the company ( you can create a good description by your own from the context only at this field ).
                3. marketType is the market the company focuses on. Determine whether the company primarily targets business-to-business (B2B), business-to-consumer (B2C), or both. Make an educated guess based on the detailed description of the company's offerings, target audience, distribution channels, and sales approach if the market type is not explicitly mentioned in the context. Consider factors such as the nature of the product/service, customer demographics, and intended market reach to accurately suggest the market type, if you connot extract the market type return null.
                4. keywords is the keywords fitting for the company. For example: Aerospace, AI, Fintech, AdTech, try to capture keywords from the words that would be relevant for a venture capitalist to evaluate a startup, if you cannot extract any keywords return and empty array.
                5. revenue is the revenue or ARR (Annual Recurring Revenue) of the company, if you find Monthly Recurring Revenue just multiply that value with 12,if you can't find anything, just assume as 0 for now, don't give wrong or hallucinating data. If you find any foreign currency, try to change it to USD, ensure to give this answer in us dollars.
                6. latestMonthlyRevenue latest monthly revenue is the latest monthly revenue of the company explicitly mentinoed in the context.
                7. currency is the currency in which the revenue is mentioned, if the revenue is converted to dollars use USD as currency.
                8. countryOfOrigin is the country of origin of the company or where the company is originated from, never use short forms of the countries instead use the full form , example United kingdom for UK, United state of America for USA , United Arab Emirites for UAE etc...
                9. countryOfOperation is the array of countries where the company is functioning.
                10. founded is date of incorporation of the company. find the date and give it as an ISO string.
                11. lastFundingRound is the last funding round of the company where the investment stage of the company. Look for indications of funding rounds mentioned in the pitch deck or reflected in the file name, such as seed funding, Series A, Series B, etc. Prioritize extracting specific funding details or milestones mentioned in the pitch deck to infer the investment stage accurately.if you can't find anything then assume that it's a New Startup and return "Pre-Seed", don't give wrong data.
                12. lastFundingYear is the date where the last funding round done. find the date and give it as an ISO string.
                13. nextFundingRound is the next funding round, which the company is planning to get investments.
                14. nextFundingTarget is the targeted investment of the company in the next funding round in millions and give the value as a number.
                15. website is the marketing website of the company.
                16. socialMedia is the social media link of the company.
                17. demo is the link to the demo vedio of the company explicitly mentioned in the context.`,
      },

      {
        role: 'system',
        content: `The type of the parsed Json must be 
                {
                  companyName:string | null;
                  description: string | null;
                  marketType: string | null;
                  keywords: string[];
                  revenue: number | null;
                  currency:string | null;
                  countryOfOrigin: string | null;
                  countryOfOperation:string[];
                  founded:string | null;
                  lastFundingRound:string | null;
                  lastFundingYear:string | null;
                  nextFundingRound:string | null;
                  nextFundingTarget:number | null; 
                  latestMonthlyRevenue:number | null;
                  website:string | null;
                  socialMedia:string | null;
                  demo:string | null;
                }`,
      },

      {
        role: 'system',
        content: `I repeat the response will be immediately used as the argument for JSON.parse() method with out any alteration. So the response must be in json format where it start with open curly braze in the start and closing curly braze in the end, a different kind of response is not allowed`,
      },
      {
        role: 'system',
        content: `You might not be able to find all the details, if you cannot find the data give it as null`,
      },
      {
        role: 'system',
        content: `try to cross check each information is correct from the context, do this crosscheck three times and give the most accurate output`,
      },

      {
        role: 'system',
        content: `Analyse and give the output`,
      },
    ],
    model: 'gpt-3.5-turbo',
  });
  const answer = chatCompletion.choices[0].message.content;
  const jsonOutput = JSON.parse(answer);
  const comparisonOutput = {
    companyName: '',
    description: '',
    marketType: '',
    keywords: [''],
    revenue: 0,
    currency: '',
    founded: '',
    countryOfOrigin: '',
    countryOfOperation: [''],
    lastFundingRound: '',
    lastFundingYear: '',
    nextFundingRound: '',
    nextFundingTarget: 0,
    latestMonthlyRevenue: 0,
    website: '',
    socialMedia: '',
    demo: '',
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
};

const extractPdfContext = async (file, pdfFolder) => {
  const filePath = path.join(pdfFolder, file);
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
};

const defaultCsvHeaders = {
  companyName: 'N/A',
  description: 'N/A',
  marketType: 'N/A',
  keywords: 'N/A',
  revenue: 0,
  currency: 'N/A',
  founded: 'N/A',
  countryOfOrigin: 'N/A',
  countryOfOperation: 'N/A',
  lastFundingRound: 'N/A',
  lastFundingYear: 'N/A',
  nextFundingRound: 'N/A',
  nextFundingTarget: 0,
  latestMonthlyRevenue: 0,
  website: 'N/A',
  socialMedia: 'N/A',
  demo: 'N/A',
};

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

const convertToCsv = async (data) => {
  const flattenData = data.map((item) => {
    const flattenObject = { ...defaultCsvHeaders };
    Object.entries(flattenObject).map(([key]) => {
      if (item[key]) {
        flattenObject[key] = item[key];
      }
    });
    if (item.countryOfOperation.length) {
      flattenObject.countryOfOperation = item.countryOfOperation.join(', ');
    }
    if (item.keywords.length) {
      flattenObject.keywords = item.keywords.join(', ');
    }
    if (item.founded) {
      flattenObject.founded = formatISODateToCustom(item.founded);
    }
    if (item.lastFundingYear) {
      flattenObject.lastFundingYear = formatISODateToCustom(item.lastFundingYear);
    }
    return flattenObject;
  });
  const csv = Papa.unparse(flattenData);
  const csvBuffer = Buffer.from(csv, 'utf-8');
  fs.writeFileSync(
    `./csvFiles/alfred_exported_data_${new Date()}.csv`,
    csvBuffer
  );
};

const backgroundExtraction = async (file, pdfFolder) => {
  const context = await extractPdfContext(file, pdfFolder);
  const jsonResponse = await extractRequestData(context);
  return jsonResponse;
};

const main = async () => {
  const pdfFolder = './pdfFiles';
  const pdfFiles = fs
    .readdirSync(pdfFolder)
    .filter((file) => path.extname(file) === '.pdf');
  const extractedDetailsPromise = [];
  for (const file of pdfFiles) {
    const promise = backgroundExtraction(file, pdfFolder);
    extractedDetailsPromise.push(promise);
  }
  const extractedDetails = await Promise.all(extractedDetailsPromise);
  await convertToCsv(extractedDetails);
  console.log('Wow! Its done!');
};
main();
