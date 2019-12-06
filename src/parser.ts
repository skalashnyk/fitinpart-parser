import 'colors';

import { Transform, Writable } from 'stream';

import $ from 'cheerio';
import Axios from 'axios';

import fs from 'fs-extra';

const csv = require('csv');
import * as moment from 'moment-timezone';

const url = (part: string) => {
  return `https://www.fitinpart.sg/index.php?route=product/search/partSearch&part_no=${part}&show=1`;
};

const rootPath = process.cwd();

const inputFileName = process.argv[2] || 'all.csv';

const logError = (e: NodeJS.ErrnoException) => {
  console.error(`[${moment.tz('Europe/Kiev').format('YYYY-MM-DD HH:mm:ss.SSS')}]: Error occurred: ${e.message}`.red);
};

async function run() {
  fs.ensureDirSync('out');

  const stream = getList()
    .on('error', logError)
    .pipe(parseTransform)
    .on('error', logError);

  stream    //Save image
    .pipe(transformFileStream)
    .on('error', logError)
    .pipe(writeFileStream)
    .on('error', logError);

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      resolve('Done');
    });
  });
}

function getList() {
  const rs = fs.createReadStream(inputFileName);
  return rs.pipe(csv.parse({columns: true}));
}

const parseTransform = new Transform({
  objectMode: true,
  async transform(record, encoding, callback) {
    // console.log('parseTransform',record)
    const itemName = record.Part;

    process.stdout.write(`[${moment.tz('Europe/Kiev').format('YYYY-MM-DD HH:mm:ss.SSS')}] ${itemName} ... `);
    const result = await getProductPage(itemName);

    if (!result.success) {
      fs.appendFileSync(rootPath + '/errors.csv', await stringify([[itemName]]));
    }
    console.log(result.success ? 'success'.green : 'error'.red);

    const $root = $(result.data);

    const {imgUrl} = getImageUrl($root);

    callback(null, {imgUrl, itemName});
  }
});

async function getProductPage(itemName: string): Promise<{ success: boolean, data: any }> {
  try {
    const url = await searchProduct(itemName);
    const result = await Axios.get(url);

    return {success: true, data: result.data};
  } catch (e) {
    return {success: false, data: null};
  }
}

async function searchProduct(itemName:string):Promise<string> {
  try {
    const result = await Axios.get(url(itemName));

    const $root = $(result.data);

    const element = $root.find('[data-part_brand=NiBK]').find('a.image_pt');
    return element.attr('href') as string;
  } catch (e) {
    return '';
  }
}

const writeFileStream = new Writable({
  objectMode: true,
  write(data, encoding, callback) {
    const file = fs.createWriteStream(`out/${data.fileName}`);
    data.stream.pipe(file);
    callback();
  }
});


const transformFileStream = new Transform({
  objectMode: true,
  async transform(data, encoding, callback) {
    try {
      const url = data.imgUrl;
      const ext = url.split('.').pop();
      const fileName = `${data.itemName}.${ext}`;
      // const fileName = `${data.brand.toLowerCase()}/img/${data.itemName}.${ext}`;
      const response = await Axios({method: 'get', url, responseType: 'stream'});
      callback(null, {stream: response.data, fileName});
    } catch (e) {
      callback(null);
    }
  }
});


function getImageUrl($root: Cheerio): { imgUrl: string } {
  const $panel = $root.find('#content');
  const imgUrl = $panel.find('a.thumbnail').attr('href') as string;

  return {imgUrl};
}

function stringify(data: any[][]): Promise<string> {
  return new Promise<string>(resolve => csv.stringify(data, (e: Error, out: string) => resolve(out)));
}


run().then(console.log).catch(console.error);
