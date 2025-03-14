const express = require('express');
const fs = require('fs').promises;
const axios = require('axios');
const app = express();

const API_BASE_URL = 'https://grecom.taobao.com/recommend?pageSize=20&language=vi&type=shop&regionId=VN&_input_charset=UTF-8&_output_charset=UTF-8&pageNo=';
const BATCH_SIZE = 50;
const APP_IDS = [42704, 42050]; // Danh sách appid cần lấy dữ liệu


// Hàm lấy dữ liệu từ API cho một trang và appid cụ thể
async function fetchPage(page, appId) {
  try {
    const response = await axios.get(`${API_BASE_URL}${page}&appid=${appId}`);
    return response.data;
  } catch (error) {
    console.error(`Lỗi khi lấy dữ liệu trang ${page} với appid=${appId}:`, error.message);
    return null;
  }
}

// Hàm ánh xạ dữ liệu từ API thành định dạng mong muốn
function mapProductData(items) {
  return items.map(item => ({
    itemId: item.itemId,
    skuId: item.skuId,
    name: item.itemTitle,              // itemTitle -> name
    imageUrl: item.itemImg,            // itemImg -> imageUrl
    price: item.itemPrice.itemPrice,   // itemPrice.itemPrice -> price
    currentPrice: item.itemPrice.itemDiscountPrice, // itemPrice.itemDiscountPrice -> currentPrice
    discount: item.itemPrice.itemDiscount || 0, // itemPrice.itemDiscount -> discount
    subsidy: item.itemPrice.subsidy, // itemPrice.subsidy => subsidy
    totalStock: item.itemSaleVolume.itemTotalStock, // itemSaleVolume.itemTotalStock -> totalStock
    currentStock: item.itemSaleVolume.itemCurrentStock, // itemSaleVolume.itemCurrentStock -> currentStock
    soldCount: item.itemSaleVolume.itemSoldCnt, // itemSaleVolume.itemSoldCnt -> soldCount
    shopType: item.buType[0] || 'Normal' // buType[0] -> shopType, mặc định "Normal" nếu không có
  }));
}


// Hàm loại bỏ sản phẩm trùng lặp
function removeDuplicates(products) {
  const seen = new Set();
  return products.filter(product => {
    const key = `${product.itemId}-${product.skuId}`;
    if (seen.has(key)) {
      //console.log(`Loại bỏ sản phẩm trùng lặp: ${product.name} (itemId: ${product.itemId}, skuId: ${product.skuId})`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Hàm lấy dữ liệu từ một API với appid cụ thể
async function fetchProductsForAppId(appId) {
  let products = []
  let page = 1;
  let isEnd = false;

  while (!isEnd) {
    const pagesToFetch = Array.from(
      { length: Math.min(BATCH_SIZE, 50) },
      (_, i) => page + i
    );

    const results = await Promise.all(pagesToFetch.map(p => fetchPage(p, appId)));

    let hasValidData = false;
    for (const data of results) {
      if (!data || !data.result || !data.result[0]?.data?.items) continue;

      const items = data.result[0].data.items;
      const mappedProducts = mapProductData(items);
      products.push(...mappedProducts);
      hasValidData = true;

      if (data.result[0].endPage === true && data.result[0].data.items.length == 0) {
        isEnd = true;
        break;
      }
    }

    // Nếu không có dữ liệu hợp lệ nào trong batch này và không phải trang cuối, thoát vòng lặp
    if (!hasValidData && results.every(r => r === null || (r.result && r.result[0]?.endPage === true))) {
      isEnd = true;
    }

    page += BATCH_SIZE;

    // Kiểm tra endPage với điều kiện an toàn hơn
    if (results.every(r => r === null || (r && r.result && r.result[0]?.endPage === true && r.result[0].data.items.length == 0))) {
      isEnd = true;
    }
  }

  console.log(`Hoàn tất lấy ${products.length} sản phẩm từ appid=${appId}`);
  return products;
}

// Hàm xử lý toàn bộ dữ liệu từ tất cả appid
async function fetchAllProducts() {
  let allProducts = [];

  // Lấy dữ liệu từ tất cả appid song song
  const productPromises = APP_IDS.map(appId => fetchProductsForAppId(appId));
  const productsByAppId = await Promise.all(productPromises);

  // Gộp tất cả sản phẩm từ các appid
  allProducts = productsByAppId.flat();

  // Loại bỏ trùng lặp
  allProducts = removeDuplicates(allProducts);

  // Ghi vào file
  //await fs.writeFile('/home/qjjfcboo/public_html/infoProducts.json', JSON.stringify(allProducts, null, 2));
  console.log(`Đã ghi ${allProducts.length} sản phẩm không trùng lặp vào infoProducts.json`);

  console.log('Hoàn tất lấy dữ liệu từ tất cả API.');
  return allProducts; // Trả về dữ liệu
}

// Route chính khi truy cập mydomain.com/myproject
app.get('/flashsale', async (req, res) => {
  try {
    const allProducts = await fetchAllProducts(); // Lấy dữ liệu từ hàm
    // Trả về dữ liệu allProducts dưới dạng JSON
    res.json(allProducts);
  } catch (error) {
      res.status(500).send(`Lỗi: ${error}`);
  }
});


// Khởi động server
app.listen(process.env.PORT || 3000, () => {
  console.log('Server đang chạy!');
});