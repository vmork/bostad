## Index request
curl 'https://api.qasa.se/graphql' \
  -H 'accept: */*' \
  -H 'accept-language: sv-SE,sv;q=0.9,en-SE;q=0.8,en;q=0.7,en-US;q=0.6' \
  -H 'cache-control: no-cache' \
  -H 'content-type: application/json' \
  -H 'dnt: 1' \
  -H 'origin: https://qasa.com' \
  -H 'pragma: no-cache' \
  -H 'priority: u=1, i' \
  -H 'referer: https://qasa.com/' \
  -H 'sec-ch-ua: "Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: cross-site' \
  -H 'sec-fetch-storage-access: none' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36' \
  --data-raw '{"operationName":"HomeSearch","variables":{"limit":59,"offset":0,"order":{"direction":"descending","orderBy":"published_or_bumped_at"},"params":{"currency":"SEK","areaIdentifier":["se/stockholm_county"],"markets":["sweden","norway","finland"]}},"query":"query HomeSearch($order: HomeIndexSearchOrderInput, $offset: Int, $limit: Int, $params: HomeSearchParamsInput) {\n  homeIndexSearch(order: $order, params: $params) {\n    documents(offset: $offset, limit: $limit) {\n      hasNextPage\n      hasPreviousPage\n      nodes {\n        bedroomCount\n        blockListing\n        rentalLengthSeconds\n        householdSize\n        corporateHome\n        description\n        endDate\n        firstHand\n        furnished\n        homeType\n        id\n        instantSign\n        market\n        lastBumpedAt\n        monthlyCost\n        petsAllowed\n        platform\n        publishedAt\n        publishedOrBumpedAt\n        rent\n        currency\n        roomCount\n        seniorHome\n        shared\n        shortcutHome\n        smokingAllowed\n        sortingScore\n        squareMeters\n        startDate\n        studentHome\n        tenantBaseFee\n        title\n        wheelchairAccessible\n        finnishLandlordAssociation\n        location {\n          id\n          locality\n          countryCode\n          streetNumber\n          point {\n            lat\n            lon\n            __typename\n          }\n          route\n          __typename\n        }\n        displayStreetNumber\n        uploads {\n          id\n          order\n          type\n          url\n          __typename\n        }\n        __typename\n      }\n      pagesCount\n      totalCount\n      __typename\n    }\n    __typename\n  }\n}"}'
  
Response: scratch/qasa_index.json
- actual rent is (rent + tenantBaseFee)

## Page request